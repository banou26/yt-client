import type { ChannelViewQuery } from '../generated/graphql'

import { css } from '@emotion/react'
import { ArrowUpRight } from 'lucide-react'

import { Rail } from '../components/rail'

type StoreShelf = NonNullable<ChannelViewQuery['channel']['store']>[number]
type Product = StoreShelf['products'][number]

/* youtube.com's Store tab, measured on @mkbhd and @LinusTechTips at 1280px on 2026-11-10: product cards on a 212px
   step, each a 200px square picture inset 4px with a wide one at its top, the name in two lines, the price, and the
   store in blue. A row that scrolls steps 220px. */
const style = css`
  > * {
    padding: 2.4rem 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  > :first-of-type {
    padding-top: 0;
  }

  > :last-child {
    border-bottom: none;
  }

  h2 {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    line-height: 2.8rem;
    color: var(--text-primary);
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 20.8rem);
    column-gap: 0.4rem;
    row-gap: 2.4rem;
    margin-top: 2rem;
  }

  .product-rail {
    --rail-gap: 1.2rem;
    --rail-arrow-top: 8.4rem;
    margin-top: 2rem;
  }

  .product {
    display: flex;
    flex-direction: column;
    width: 20.8rem;
    font-size: 1.4rem;
    line-height: 2rem;
    color: var(--text-primary);
  }

  .product-image {
    width: 20rem;
    height: 20rem;
    margin: 0.4rem;
    object-fit: contain;
    object-position: top;
  }

  .product-title {
    margin-top: 1rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .product-price {
    margin-top: 0.6rem;
    font-weight: 500;
  }

  .product-note {
    font-weight: 400;
    color: var(--text-secondary);
  }

  .product-merchant {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.4rem;
    font-size: 1.2rem;
    line-height: 1.8rem;
    color: var(--accent);
  }
`

const ProductCard = ({ product }: { product: Product }) => (
  <a className='product' href={product.url} target='_blank' rel='noreferrer noopener'>
    {product.thumbnail ? <img className='product-image' src={product.thumbnail} alt='' loading='lazy' /> : <span className='product-image' />}
    <span className='product-title'>{product.title}</span>
    {product.price
      ? <span className='product-price'>{product.price}{product.priceNote ? <span className='product-note'> {product.priceNote}</span> : undefined}</span>
      : undefined}
    {product.merchant
      ? <span className='product-merchant'>{product.merchant}<ArrowUpRight size={14} strokeWidth={2} aria-hidden='true' /></span>
      : undefined}
  </a>
)

/** A channel's Store tab: its rows of products, each linking to the product's page on the store that sells it. */
export const ChannelStore = ({ shelves }: { shelves: StoreShelf[] }) => (
  <div css={style}>
    {shelves.map((shelf, index) => (
      <section key={`${index}:${shelf.title}`} className='store-shelf' aria-label={shelf.title}>
        <h2>{shelf.title}</h2>
        {shelf.scrolls
          ? (
            <div className='product-rail'>
              <Rail label={shelf.title} count={shelf.products.length}>
                {shelf.products.map((product, place) => <ProductCard key={`${place}:${product.url}`} product={product} />)}
              </Rail>
            </div>
          )
          : (
            <div className='product-grid'>
              {shelf.products.map((product, place) => <ProductCard key={`${place}:${product.url}`} product={product} />)}
            </div>
          )}
      </section>
    ))}
  </div>
)

export default ChannelStore
