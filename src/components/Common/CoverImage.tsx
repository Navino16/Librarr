'use client';

import React, { useState } from 'react';
import Image from 'next/image';

/** Default placeholder icon shown when image fails and no fallback prop is given */
function DefaultFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-librarr-bg-lighter text-librarr-text-muted">
      <svg
        className="w-8 h-8"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    </div>
  );
}

interface CoverImageProps {
  src: string;
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  fallback?: React.ReactNode;
  priority?: boolean;
}

export default function CoverImage({
  src,
  alt,
  fill = true,
  sizes,
  className,
  fallback,
  priority,
}: CoverImageProps) {
  const [error, setError] = useState(false);

  if (error || !src || !(src.startsWith('/') || src.startsWith('http'))) {
    return <>{fallback ?? <DefaultFallback />}</>;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      sizes={sizes}
      className={className}
      priority={priority}
      onError={() => setError(true)}
    />
  );
}
