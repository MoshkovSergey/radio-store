'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';

import { resolveMediaUrl } from '@/lib/api';
import { getInitials } from '@/lib/format';
import type { ProductImage } from '@/lib/types';

export function ProductGallery({
  images,
  primaryImageUrl,
  name,
}: {
  images: ProductImage[];
  primaryImageUrl?: string | null;
  name: string;
}) {
  const orderedImages = useMemo(() => {
    if (images.length > 0) {
      return [...images].sort((a, b) => {
        if (a.is_primary !== b.is_primary) {
          return a.is_primary ? -1 : 1;
        }

        if (a.position !== b.position) {
          return a.position - b.position;
        }

        return a.id - b.id;
      });
    }

    if (primaryImageUrl) {
      return [
        {
          id: 0,
          url: primaryImageUrl,
          alt: name,
          position: 0,
          is_primary: true,
        },
      ];
    }

    return [];
  }, [images, name, primaryImageUrl]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = orderedImages[activeIndex] ?? null;
  const imageUrl = resolveMediaUrl(activeImage?.url);

  return (
    <div className="card product-gallery">
      <div className="gallery-main">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={activeImage?.alt ?? name}
            fill
            sizes="(max-width: 1080px) 100vw, 55vw"
            className="gallery-img"
            priority
          />
        ) : (
          <div className="gallery-placeholder">
            <span>{getInitials(name)}</span>
          </div>
        )}
      </div>

      {orderedImages.length > 1 ? (
        <div className="gallery-thumbs">
          {orderedImages.map((image, index) => {
            const thumbUrl = resolveMediaUrl(image.url);

            return (
              <button
                key={image.id || index}
                type="button"
                className={
                  index === activeIndex ? 'gallery-thumb active' : 'gallery-thumb'
                }
                onClick={() => setActiveIndex(index)}
                aria-label={`Показать фото ${index + 1}`}
              >
                {thumbUrl ? (
                  <Image
                    src={thumbUrl}
                    alt={image.alt ?? name}
                    fill
                    sizes="72px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}