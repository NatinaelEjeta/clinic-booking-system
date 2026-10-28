"use client";

/** Responsive top navigation with role-aware links and a mobile sheet menu. */

import Link from "next/link";
import { useTheme } from "next-themes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Stethoscope,
  Sun,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useLogout, useMe } from "@/hooks/use-auth";
import { ROLE_HOME } from "@/lib/constants";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* CSS-driven icon swap — no hydration mismatch, no effect needed. */}
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
    </Button>
  );
}

function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Stethoscope className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="text-base">CarePoint Clinic</span>
    </Link>
  );
}

const LINKS = {
  CUSTOMER: [
    { href: "/book", label: "Book appointment", icon: CalendarDays },
    { href: "/appointments", label: "My appointments", icon: UserRound },
  ],
  STAFF: [{ href: "/schedule", label: "My schedule", icon: CalendarDays }],
  ADMIN: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/manage", label: "Manage clinic", icon: Settings },
  ],
} as const;

export function Navbar() {
  const { me, isLoading } = useMe();
  const logout = useLogout();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = me ? LINKS[me.role] : [];
  const initials = (me?.name ?? "?")
    .split(" ")
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <BrandMark />

        {/* Desktop links */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {links.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />

          {isLoading ? null : me ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 pl-1.5">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-32 truncate sm:inline">{me.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="flex flex-col">
                  <span>{me.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {me.role === "ADMIN"
                      ? "Administrator"
                      : me.role === "STAFF"
                        ? "Doctor"
                        : "Patient"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">Change password</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={ROLE_HOME[me.role]}>My home page</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/") })}
                >
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-1.5 md:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/register">Create account</Link>
              </Button>
            </div>
          )}

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Navigation menu</SheetTitle>
              <div className="mt-2 flex flex-col gap-1">
                {me ? (
                  <>
                    <p className="px-2 pb-1 text-sm text-muted-foreground">
                      Signed in as <span className="font-medium text-foreground">{me.name}</span>
                    </p>
                    {links.map((link) => (
                      <Button
                        key={link.href}
                        variant="ghost"
                        className="justify-start gap-2"
                        onClick={() => setMobileOpen(false)}
                        asChild
                      >
                        <Link href={link.href}>
                          <link.icon className="h-4 w-4" aria-hidden /> {link.label}
                        </Link>
                      </Button>
                    ))}
                    <Separator className="my-2" />
                    <Button
                      variant="ghost"
                      className="justify-start gap-2"
                      onClick={() => setMobileOpen(false)}
                      asChild
                    >
                      <Link href="/account">
                        <Settings className="h-4 w-4" aria-hidden /> Change password
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      className="justify-start gap-2 text-destructive hover:text-destructive"
                      onClick={() =>
                        logout.mutate(undefined, {
                          onSuccess: () => {
                            setMobileOpen(false);
                            router.push("/");
                          },
                        })
                      }
                      disabled={logout.isPending}
                    >
                      <LogOut className="h-4 w-4" aria-hidden /> Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() => setMobileOpen(false)}
                      asChild
                    >
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button
                      className="justify-start"
                      onClick={() => setMobileOpen(false)}
                      asChild
                    >
                      <Link href="/register">Create account</Link>
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
