// made-up IDs; a page ID is 21 digits and only a brand channel's row carries one (measured 2026-11-06)
export const BRAND_PAGE_ID = '100000000000000000001'
export const OTHER_PAGE_ID = '100000000000000000002'
const USER_ID = '100000000000000000009'

export type AccountRowFixture = { name: string, handle: string, pageId?: string, selected?: boolean }

const tokens = (pageId?: string) => [
  ...(pageId ? [{ pageIdToken: { pageId } }] : []),
  { accountStateToken: { hasChannel: 'true', isMerged: 'false', obfuscatedGaiaId: USER_ID } },
  { offlineCacheKeyToken: { clientCacheKey: USER_ID } },
  { accountSigninToken: { signinUrl: `/signin?action_handle_signin=true&authuser=0${pageId ? `&pageid=${pageId}` : ''}&next=%2F` } },
  { datasyncIdToken: { datasyncIdToken: pageId ? `${pageId}||${USER_ID}` : `${USER_ID}||` } },
]

/** The WEB `/account/accounts_list` answer to `{ context }` in its measured shape: one section of rows and a link. */
export const accountsListAnswer = (rows: AccountRowFixture[], { loggedOut = false } = {}) => ({
  responseContext: { mainAppWebResponseContext: { loggedOut } },
  actions: loggedOut
    ? undefined
    : [{
        getMultiPageMenuAction: {
          menu: {
            multiPageMenuRenderer: {
              sections: [{
                accountSectionListRenderer: {
                  contents: [{
                    accountItemSectionRenderer: {
                      contents: [
                        ...rows.map((row) => ({
                          accountItem: {
                            accountName: { simpleText: row.name },
                            accountPhoto: { thumbnails: [{ url: `https://yt3.ggpht.com/${row.handle.slice(1)}=s88`, width: 88, height: 88 }] },
                            isSelected: row.selected === true,
                            isDisabled: false,
                            hasChannel: true,
                            serviceEndpoint: { selectActiveIdentityEndpoint: { supportedTokens: tokens(row.pageId) } },
                            accountByline: { simpleText: '1 subscriber' },
                            channelHandle: { simpleText: row.handle },
                          },
                        })),
                        {
                          compactLinkRenderer: {
                            title: { simpleText: 'View all channels' },
                            navigationEndpoint: { browseEndpoint: { browseId: 'SPaccount_overview' } },
                          },
                        },
                      ],
                    },
                  }],
                },
              }],
            },
          },
        },
      }],
})

/** Two channels of one Google account that share a name: its own, and a brand channel. */
export const twoChannels = (selected: 'own' | 'brand'): AccountRowFixture[] => [
  { name: 'Viewer', handle: '@viewer', selected: selected === 'own' },
  { name: 'Viewer', handle: '@viewer-brand', pageId: BRAND_PAGE_ID, selected: selected === 'brand' },
]
