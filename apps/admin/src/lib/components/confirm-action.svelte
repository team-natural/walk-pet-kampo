<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";

  // Irreversible operations go through a confirmation step (PRD-04 §4-4). The form posts normally
  // rather than via fetch, so the operation survives a dead island.
  let {
    action,
    triggerLabel,
    title,
    message,
    confirmLabel,
    destructive = false,
    name,
    value,
    reasonLabel,
    reasonRequired = false,
  }: {
    action: string;
    triggerLabel: string;
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    name?: string;
    value?: string;
    reasonLabel?: string;
    reasonRequired?: boolean;
  } = $props();

  const id = $props.id();
</script>

<AlertDialog.Root>
  <AlertDialog.Trigger class={buttonVariants({ variant: destructive ? "destructive" : "outline", size: "sm" })}>
    {triggerLabel}
  </AlertDialog.Trigger>
  <AlertDialog.Content>
    <form method="post" {action} class="contents">
      <AlertDialog.Header>
        <AlertDialog.Title>{title}</AlertDialog.Title>
        <AlertDialog.Description>{message}</AlertDialog.Description>
      </AlertDialog.Header>
      {#if name && value}
        <input type="hidden" {name} {value} />
      {/if}
      {#if reasonLabel}
        <div class="flex flex-col gap-2">
          <Label for="reason-{id}">{reasonLabel}</Label>
          <Textarea id="reason-{id}" name="reason" rows={3} required={reasonRequired} />
        </div>
      {/if}
      <AlertDialog.Footer>
        <AlertDialog.Cancel>やめる</AlertDialog.Cancel>
        <Button type="submit" variant={destructive ? "destructive" : "default"}>{confirmLabel}</Button>
      </AlertDialog.Footer>
    </form>
  </AlertDialog.Content>
</AlertDialog.Root>
