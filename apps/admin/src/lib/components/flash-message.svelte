<script lang="ts">
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import * as Alert from "$lib/components/ui/alert/index.js";

  // Server-rendered from `?status=`, not a toast: every write on this console answers with a
  // redirect, and a client-side toast store has nothing left to read after the navigation.
  let { status }: { status: string | null } = $props();

  const MESSAGES: Record<string, { title: string; ok: boolean }> = {
    saved: { title: "保存しました。", ok: true },
    approved: { title: "承認しました。", ok: true },
    rejected: { title: "否認しました。", ok: true },
    returned: { title: "差し戻しました。", ok: true },
    transitioned: { title: "状態を変更しました。", ok: true },
    refunded: { title: "返金を受け付けました。", ok: true },
    "paid-out": { title: "振込を実行しました。", ok: true },
    failed: { title: "処理できませんでした。時間をおいてお試しください。", ok: false },
    conflict: { title: "この状態からは実行できません。画面を再読み込みしてください。", ok: false },
  };

  const flash = $derived(status ? MESSAGES[status] : undefined);
</script>

{#if flash}
  <Alert.Root variant={flash.ok ? "default" : "destructive"} role="status">
    {#if flash.ok}
      <CircleCheckIcon />
    {:else}
      <CircleAlertIcon />
    {/if}
    <Alert.Title>{flash.title}</Alert.Title>
  </Alert.Root>
{/if}
