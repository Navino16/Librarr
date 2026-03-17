import Image from 'next/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: { w: 120, h: 28 }, md: { w: 154, h: 36 }, lg: { w: 240, h: 56 } };

const Logo = ({ size = 'md', className = '' }: LogoProps) => (
  <Image
    src="/logo_full.svg"
    alt="Librarr"
    width={sizeMap[size].w}
    height={sizeMap[size].h}
    className={className}
    priority
  />
);

export default Logo;
