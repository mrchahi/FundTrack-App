/**
 * Central navigation guard. A page can register a synchronous callback that
 * returns `false` to veto a page switch (e.g. unsaved settings). The app's
 * navigation handler consults this before changing the page.
 */
let guard: ((page: string) => boolean) | null = null

export function setNavGuard(fn: ((page: string) => boolean) | null): void {
  guard = fn
}

export function checkNav(page: string): boolean {
  return guard ? guard(page) : true
}
