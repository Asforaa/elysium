import { Controller, Get } from '@nestjs/common';
import { LibraryService } from './library.service';

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('files')
  listFiles() {
    return this.library.listFiles();
  }
}
