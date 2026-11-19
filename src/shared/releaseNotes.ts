import releaseNotesJson from './releaseNotes.json'

export interface ReleaseNoteSection {
  title: string
  items: string[]
}

export interface ReleaseNote {
  version: string
  title: string
  date?: string
  sections: ReleaseNoteSection[]
}

const releases = (releaseNotesJson as { releases: ReleaseNote[] }).releases

export const RELEASE_NOTES = releases

export function getReleaseNotes(version: string): ReleaseNote | undefined {
  return releases.find((release) => release.version === version)
}
