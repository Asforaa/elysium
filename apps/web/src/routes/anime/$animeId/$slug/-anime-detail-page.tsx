import { useMemo } from "react";
import type {
  AnimeMetadataDetails,
  AnimeMetadataSearchResult,
  AnimeRelation,
  EpisodeSummary,
} from "@elysium/shared";
import type { FocusedImage } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatEpisodeTitle,
  formatMediaFormat,
  formatScore,
  formatToken,
  getAnimeMetadataLine,
  getCombinedTags,
  hasDetails,
  hideBrokenImage,
} from "@/lib/media-ui";

export function RelatedAnimeSection({
  relations,
  selectedAnimeId,
  onAnimeSelect,
}: {
  relations: AnimeRelation[];
  selectedAnimeId?: number;
  onAnimeSelect: (anime: AnimeMetadataSearchResult) => void;
}) {
  const sortedRelations = useMemo(
    () =>
      relations.toSorted((first, second) => {
        if (first.kind === second.kind) {
          return (first.anime.seasonYear ?? 0) - (second.anime.seasonYear ?? 0);
        }

        return first.kind === "prequel" ? -1 : 1;
      }),
    [relations],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prequel & Sequel</CardTitle>
        <CardDescription>
          Select a related anime to load its episodes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sortedRelations.length ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {sortedRelations.map((relation) => (
              <RelatedAnimeCard
                key={`${relation.kind}-${relation.anime.id}`}
                relation={relation}
                selected={selectedAnimeId === relation.anime.id}
                onAnimeSelect={onAnimeSelect}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No prequel or sequel data found.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function RelatedAnimeCard({
  relation,
  selected,
  onAnimeSelect,
}: {
  relation: AnimeRelation;
  selected: boolean;
  onAnimeSelect: (anime: AnimeMetadataSearchResult) => void;
}) {
  const coverUrl =
    relation.anime.coverImage?.extraLarge ??
    relation.anime.coverImage?.large ??
    relation.anime.coverImage?.medium;

  return (
    <div
      className="flex h-full flex-col gap-3 rounded-lg border bg-card p-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      role="button"
      tabIndex={0}
      onClick={() => onAnimeSelect(relation.anime)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onAnimeSelect(relation.anime);
        }
      }}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md border bg-muted">
        {coverUrl ? (
          <img
            alt={`${relation.anime.displayTitle} cover`}
            className="h-full w-full object-cover"
            src={coverUrl}
            onError={hideBrokenImage}
          />
        ) : null}
        <Badge className="absolute left-2 top-2 shadow-sm" variant="secondary">
          {relation.label}
        </Badge>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {relation.anime.seasonYear ? (
            <Badge variant="outline">{relation.anime.seasonYear}</Badge>
          ) : null}
          {selected ? <Badge>Selected</Badge> : null}
        </div>
        <p className="line-clamp-3 text-sm font-medium leading-snug">
          {relation.anime.displayTitle}
        </p>
        {relation.anime.format ? (
          <p className="text-xs text-muted-foreground">
            {formatMediaFormat(relation.anime.format)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AnimeDetailPanel({
  anime,
  loading,
  onImageFocus,
}: {
  anime: AnimeMetadataSearchResult | AnimeMetadataDetails;
  loading: boolean;
  onImageFocus: (image: FocusedImage) => void;
}) {
  const details = hasDetails(anime) ? anime : undefined;
  const coverUrl =
    anime.coverImage?.extraLarge ??
    anime.coverImage?.large ??
    anime.coverImage?.medium;
  const hasBanner = Boolean(anime.bannerImage);
  const metadataLine = getAnimeMetadataLine(anime);

  return (
    <section className="relative overflow-hidden rounded-xl border bg-card text-card-foreground">
      {hasBanner ? (
        <div className="relative z-0 h-[clamp(10rem,22vw,17rem)] overflow-hidden bg-muted">
          <FocusableImage
            alt={`${anime.displayTitle} banner`}
            buttonClassName="block h-full w-full rounded-none"
            imageClassName="h-full w-full object-cover opacity-80"
            src={anime.bannerImage ?? ""}
            onFocusImage={onImageFocus}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-card via-card/80 to-transparent" />
        </div>
      ) : null}
      <div className="relative z-10 grid gap-4 p-4 md:grid-cols-[11rem_minmax(0,1fr)] md:p-6">
        <div className={cn("relative z-20", hasBanner && "md:-mt-20")}>
          {coverUrl ? (
            <FocusableImage
              alt={`${anime.displayTitle} cover`}
              buttonClassName="block w-32 rounded-lg border bg-muted shadow-sm md:w-44"
              imageClassName="aspect-[2/3] w-full object-cover"
              src={coverUrl}
              onFocusImage={onImageFocus}
            />
          ) : (
            <div className="aspect-[2/3] w-32 rounded-lg border bg-muted md:w-44" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold leading-tight">
                {anime.displayTitle}
              </h2>
              {loading ? <Badge variant="secondary">Refreshing</Badge> : null}
            </div>
            {metadataLine ? (
              <p className="text-sm text-muted-foreground">{metadataLine}</p>
            ) : null}
            {anime.description ? (
              <p className="max-w-4xl whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {anime.description}
              </p>
            ) : null}
          </div>

          {details ? (
            <AnimeDetailExtras details={details} onImageFocus={onImageFocus} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AnimeDetailExtras({
  details,
  onImageFocus,
}: {
  details: AnimeMetadataDetails;
  onImageFocus: (image: FocusedImage) => void;
}) {
  const tags = getCombinedTags(details);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem label="Score" value={formatScore(details)} />
        <InfoItem
          label="Studios"
          value={details.studios.map((studio) => studio.name).join(", ")}
        />
        <InfoItem label="Source" value={formatToken(details.source)} />
        <InfoItem label="Start" value={formatDate(details.startDate)} />
      </div>

      {details.title.english ? (
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">English Name</p>
          <p className="mt-1 text-sm font-medium">{details.title.english}</p>
        </div>
      ) : null}

      {tags.length ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Badge className="px-3 py-1" key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      {details.characters.length ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Characters</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {details.characters.slice(0, 6).map((character) => (
              <div
                className="flex min-w-0 items-center gap-3 rounded-lg border p-2"
                key={character.id}
              >
                {character.imageUrl ? (
                  <FocusableImage
                    alt={character.name}
                    buttonClassName="h-14 w-10"
                    imageClassName="h-14 w-10 rounded-md border object-cover"
                    src={character.imageUrl}
                    onFocusImage={onImageFocus}
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {character.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      formatToken(character.role),
                      character.voiceActors[0]?.name,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function InfoItem({ label, value }: { label: string; value?: string }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium">{value}</p>
    </div>
  );
}

export function FocusableImage({
  alt,
  buttonClassName,
  imageClassName,
  onFocusImage,
  src,
  stopPropagation = false,
}: {
  alt: string;
  buttonClassName?: string;
  imageClassName?: string;
  onFocusImage: (image: FocusedImage) => void;
  src: string;
  stopPropagation?: boolean;
}) {
  return (
    <button
      className={cn(
        "overflow-hidden rounded-md text-left outline-none focus:outline-none focus-visible:outline-none",
        buttonClassName,
      )}
      type="button"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }

        event.currentTarget.blur();
        onFocusImage({ alt, src });
      }}
    >
      <img
        alt={alt}
        className={cn("h-full w-full object-cover", imageClassName)}
        src={src}
        onError={hideBrokenImage}
      />
    </button>
  );
}

export function EpisodeButton({
  episode,
  selected,
  onSelect,
}: {
  episode: EpisodeSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      type="button"
      onClick={onSelect}
    >
      <span>{formatEpisodeTitle(episode)}</span>
      {selected ? <Badge variant="secondary">Selected</Badge> : null}
    </button>
  );
}
