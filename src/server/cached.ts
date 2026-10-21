import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "./db";
import * as catalogue from "./services/catalogue";

/**
 * Cached reads for slow-changing public content (destinations, categories, regions).
 * Availability, slots, prices on detail pages and anything personalised are never cached here.
 * Call only from request-time code (after `connection()`), never during the build.
 * Invalidate with updateTag(CATALOGUE_TAG) after admin edits.
 */
export const CATALOGUE_TAG = "catalogue";

export async function cachedDestinations(filters: catalogue.DestinationFilters) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOGUE_TAG);
  return catalogue.listDestinations(await getDb(), filters);
}

export async function cachedFeaturedDestinations(limit = 6) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOGUE_TAG);
  return catalogue.listFeaturedDestinations(await getDb(), limit);
}

export async function cachedDestination(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOGUE_TAG);
  return catalogue.getDestination(await getDb(), slug);
}

export async function cachedCategories() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOGUE_TAG);
  return catalogue.listCategories(await getDb());
}

export async function cachedRegions() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOGUE_TAG);
  return catalogue.listRegions(await getDb());
}

export async function cachedDestinationsBrief() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOGUE_TAG);
  return catalogue.listAllDestinationsBrief(await getDb());
}

export async function cachedStats() {
  "use cache";
  cacheLife("minutes");
  cacheTag(CATALOGUE_TAG);
  return catalogue.getPlatformStats(await getDb());
}
