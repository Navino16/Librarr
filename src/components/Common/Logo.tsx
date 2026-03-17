interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const heightMap = { sm: 28, md: 36, lg: 56 };

const Logo = ({ size = 'md', className = '' }: LogoProps) => (
  <img
    src="/logo_full.svg"
    alt="Librarr"
    height={heightMap[size]}
    style={{ height: heightMap[size] }}
    className={className}
  />
);

export default Logo;
