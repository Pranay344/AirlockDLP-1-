'use client';

import {
  Bell,
  Home,
  LineChart,
  Package,
  Package2,
  ShoppingCart,
  Users,
  Search,
  PanelLeft,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth, useUser } from '@/firebase';
import { initiateAnonymousSignIn } from '@/firebase/non-blocking-login';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Skeleton } from '../ui/skeleton';

type PageHeaderProps = {
  title: string;
};

export function PageHeader({ title }: PageHeaderProps) {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();

  const handleLogin = () => {
    initiateAnonymousSignIn(auth);
  };

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="flex md:hidden" />
        <h1 className="font-headline text-xl font-semibold md:text-2xl">
          {title}
        </h1>
      </div>
      <div className="relative ml-auto flex-1 md:grow-0">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search..."
          className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[320px]"
        />
      </div>
      {isUserLoading ? (
        <Skeleton className="h-9 w-9 rounded-full" />
      ) : user ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="overflow-hidden rounded-full"
            >
              <Avatar>
                {user.photoURL && <AvatarImage src={user.photoURL} alt={user.displayName || 'User'} />}
                <AvatarFallback>{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Support</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => auth.signOut()}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button onClick={handleLogin}>Login</Button>
      )}
    </header>
  );
}
