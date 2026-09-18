<script lang="ts">
  import { onMount } from "svelte";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import LogOutIcon from "@lucide/svelte/icons/log-out";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";

  let { user }: { user: { name: string; email: string } } = $props();

  const sidebar = Sidebar.useSidebar();

  // POST, not a link: logout deletes the admin_sessions row, and a GET that mutates state
  // would be triggerable by any <img> pointed at it.
  let submitting = $state(false);
  let error = $state("");

  // The console shell is a large island, so there is a real window where this markup exists and
  // its JS does not. A click in that window opens nothing and reads as a dead button.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  async function handleLogout() {
    if (submitting) return;
    submitting = true;
    error = "";

    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });

      // 401 means the session was already gone (expired, or revoked elsewhere) — the user is
      // logged out either way, so send them to the login screen rather than showing an error.
      if (response.ok || response.status === 401) {
        window.location.replace("/");
        return;
      }

      error = "ログアウトできませんでした。もう一度お試しください。";
      submitting = false;
    } catch {
      error = "サーバーに接続できませんでした。通信環境をご確認ください。";
      submitting = false;
    }
  }
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton {...props} size="lg" disabled={!hydrated}>
            <!-- The initial is decoration next to the name it was cut from; announcing it twice adds nothing. -->
            <Avatar.Root class="size-8 rounded-lg" aria-hidden="true">
              <Avatar.Fallback class="rounded-lg">{user.name.slice(0, 1)}</Avatar.Fallback>
            </Avatar.Root>
            <div class="grid flex-1 text-left leading-tight">
              <span class="truncate font-medium">{user.name}</span>
              <span class="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDownIcon class="ml-auto" />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content class="w-(--bits-dropdown-menu-anchor-width) min-w-56" side={sidebar.isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
        <DropdownMenu.Label class="font-normal">
          <div class="grid text-left leading-tight">
            <span class="truncate font-medium">{user.name}</span>
            <span class="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenu.Label>
        <DropdownMenu.Separator />
        <DropdownMenu.Group>
          <DropdownMenu.Item disabled={submitting} onSelect={handleLogout}>
            <LogOutIcon />
            {submitting ? "ログアウトしています…" : "ログアウト"}
          </DropdownMenu.Item>
        </DropdownMenu.Group>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    {#if error}
      <p role="alert" class="px-3 pt-2 text-xs text-destructive">{error}</p>
    {/if}
  </Sidebar.MenuItem>
</Sidebar.Menu>
