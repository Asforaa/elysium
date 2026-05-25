import {
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Request, Response } from 'express';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('files')
  listFiles() {
    return this.library.listFiles();
  }

  @Get('anime')
  listAnime() {
    return this.library.listAnime();
  }

  @Get('files/:id/stream')
  @Header('Accept-Ranges', 'bytes')
  async streamFile(
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const file = await this.library.getFile(id);

    if (!file) {
      throw new NotFoundException(`Unknown local media file: ${id}`);
    }

    const fileStat = await stat(file.filePath).catch(() => undefined);

    if (!fileStat?.isFile()) {
      throw new NotFoundException(`Local media file is missing: ${id}`);
    }

    const range = parseRangeHeader(request.headers.range, fileStat.size);
    const contentType = contentTypeFromFilename(file.filename);

    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Content-Type', contentType);

    if (!range) {
      response.status(200);
      response.setHeader('Content-Length', fileStat.size);
      createReadStream(file.filePath).pipe(response);
      return;
    }

    response.status(206);
    response.setHeader('Content-Length', range.end - range.start + 1);
    response.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${fileStat.size}`,
    );
    createReadStream(file.filePath, {
      end: range.end,
      start: range.start,
    }).pipe(response);
  }

  @Delete('files/:id')
  deleteFile(@Param('id') id: string) {
    return this.library.deleteFile(id);
  }
}

function parseRangeHeader(rangeHeader: string | undefined, size: number) {
  if (!rangeHeader) {
    return undefined;
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/u);

  if (!match) {
    return undefined;
  }

  const requestedStart = match[1] ? Number(match[1]) : undefined;
  const requestedEnd = match[2] ? Number(match[2]) : undefined;

  if (requestedStart === undefined && requestedEnd === undefined) {
    return undefined;
  }

  const isSuffixRange = requestedStart === undefined;
  const start = isSuffixRange
    ? Math.max(0, size - Math.max(0, requestedEnd ?? 0))
    : requestedStart;
  const end = isSuffixRange
    ? size - 1
    : Math.min(requestedEnd ?? size - 1, size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return undefined;
  }

  return { end, start };
}

function contentTypeFromFilename(filename: string) {
  switch (extname(filename).toLowerCase()) {
    case '.m4v':
    case '.mp4':
      return 'video/mp4';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}
