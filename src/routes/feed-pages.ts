// page is undefined while a continuation is in flight and after one fails; the pages already loaded stay either way
export const withPage = <T>(pages: T[], page: T | undefined): T[] => page ? [...pages, page] : pages
