/** A Chinese proper name already carries its feature word (河、溪等). */
export function formatRiverName(name: string, type?: string): string {
  return /\p{Script=Han}/u.test(name) || !type ? name : `${name} ${type}`;
}
