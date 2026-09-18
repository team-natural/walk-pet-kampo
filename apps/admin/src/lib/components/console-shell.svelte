<script lang="ts">
  import BanknoteIcon from "@lucide/svelte/icons/banknote";
  import Building2Icon from "@lucide/svelte/icons/building-2";
  import CalendarCheckIcon from "@lucide/svelte/icons/calendar-check";
  import ClipboardCheckIcon from "@lucide/svelte/icons/clipboard-check";
  import CreditCardIcon from "@lucide/svelte/icons/credit-card";
  import DogIcon from "@lucide/svelte/icons/dog";
  import FootprintsIcon from "@lucide/svelte/icons/footprints";
  import HeartHandshakeIcon from "@lucide/svelte/icons/heart-handshake";
  import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
  import MessageSquareIcon from "@lucide/svelte/icons/message-square";
  import ScrollTextIcon from "@lucide/svelte/icons/scroll-text";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import UsersIcon from "@lucide/svelte/icons/users";
  import ConsoleUserMenu from "$lib/components/console-user-menu.svelte";
  import FlashMessage from "$lib/components/flash-message.svelte";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { CONSOLE_NAV, isCurrentRoute, type ConsoleNavIcon } from "$lib/console-nav";

  let {
    user,
    pathname,
    sidebarOpen = true,
    breadcrumbs = [],
    flashStatus = null,
    children,
  }: {
    user: { name: string; email: string };
    pathname: string;
    sidebarOpen?: boolean;
    breadcrumbs?: { label: string; href?: string }[];
    flashStatus?: string | null;
    children?: import("svelte").Snippet;
  } = $props();

  const ICONS: Record<ConsoleNavIcon, typeof LayoutDashboardIcon> = {
    dashboard: LayoutDashboardIcon,
    application: ClipboardCheckIcon,
    organization: Building2Icon,
    dog: DogIcon,
    walk: FootprintsIcon,
    walker: UsersIcon,
    reservation: CalendarCheckIcon,
    payment: CreditCardIcon,
    payout: BanknoteIcon,
    incident: TriangleAlertIcon,
    adoption: HeartHandshakeIcon,
    inquiry: MessageSquareIcon,
    auditLog: ScrollTextIcon,
  };
</script>

<Sidebar.Provider open={sidebarOpen}>
  <!-- Ahead of the sidebar in the DOM, or reaching the content costs 14 tab stops on every screen. -->
  <a href="#main-content" class="sr-only rounded-md focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"> 本文へスキップ </a>

  <Sidebar.Root collapsible="icon">
    <Sidebar.Header>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton size="lg">
            {#snippet child({ props })}
              <a href="/dashboard" {...props}>
                <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <FootprintsIcon />
                </div>
                <div class="grid flex-1 text-left leading-tight">
                  <span class="truncate font-medium">保護犬おさんぽ</span>
                  <span class="truncate text-xs text-muted-foreground">運営管理</span>
                </div>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Header>

    <Sidebar.Content>
      <!-- Sidebar.Content is a plain div, and PRD-04 §7 asks for the nav landmark. -->
      <nav aria-label="運営管理メニュー" class="flex flex-col gap-2">
        {#each CONSOLE_NAV as group, groupIndex (group.label ?? "root")}
          {@const labelId = `console-nav-group-${groupIndex}`}
          <Sidebar.Group>
            {#if group.label}
              <Sidebar.GroupLabel id={labelId}>{group.label}</Sidebar.GroupLabel>
            {/if}
            <Sidebar.GroupContent>
              <Sidebar.Menu aria-labelledby={group.label ? labelId : undefined}>
                {#each group.items as item (item.href)}
                  {@const current = isCurrentRoute(pathname, item.href)}
                  {@const Icon = ICONS[item.icon]}
                  <Sidebar.MenuItem>
                    <Sidebar.MenuButton isActive={current} tooltipContent={item.label}>
                      {#snippet child({ props })}
                        <a href={item.href} aria-current={current ? "page" : undefined} {...props}>
                          <Icon />
                          <span>{item.label}</span>
                        </a>
                      {/snippet}
                    </Sidebar.MenuButton>
                  </Sidebar.MenuItem>
                {/each}
              </Sidebar.Menu>
            </Sidebar.GroupContent>
          </Sidebar.Group>
        {/each}
      </nav>
    </Sidebar.Content>

    <Sidebar.Footer>
      <ConsoleUserMenu {user} />
    </Sidebar.Footer>
    <!-- The vendored primitives label themselves in English; aria-label wins over their sr-only text. -->
    <Sidebar.Rail aria-label="サイドナビを開閉" title="サイドナビを開閉" />
  </Sidebar.Root>

  <Sidebar.Inset id="main-content">
    <header class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Sidebar.Trigger class="-ms-1" aria-label="サイドナビを開閉" />
      <Separator orientation="vertical" class="me-1 h-4" />
      <Breadcrumb.Root>
        <Breadcrumb.List>
          {#each breadcrumbs as crumb, index (crumb.label)}
            {#if index > 0}
              <Breadcrumb.Separator />
            {/if}
            <Breadcrumb.Item>
              {#if crumb.href}
                <Breadcrumb.Link href={crumb.href}>{crumb.label}</Breadcrumb.Link>
              {:else}
                <Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
              {/if}
            </Breadcrumb.Item>
          {/each}
        </Breadcrumb.List>
      </Breadcrumb.Root>
    </header>

    <div class="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <FlashMessage status={flashStatus} />
      {@render children?.()}
    </div>
  </Sidebar.Inset>
</Sidebar.Provider>
