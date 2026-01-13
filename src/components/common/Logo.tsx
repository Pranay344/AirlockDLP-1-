import { Lock } from 'lucide-react';
import type { FC } from 'react';

type LogoProps = {
  className?: string;
};

const Logo: FC<LogoProps> = ({ className }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="rounded-lg bg-primary p-2 text-primary-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <span className="font-headline text-xl font-bold text-sidebar-foreground group-data-[state=collapsed]:hidden">
        Airlock DLP
      </span>
    </div>
  );
};

export default Logo;
