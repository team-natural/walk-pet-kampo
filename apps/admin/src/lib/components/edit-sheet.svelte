<script lang="ts">
  import { onMount } from "svelte";
  import { Button, buttonVariants } from "$lib/components/ui/button/index.js";
  import * as Field from "$lib/components/ui/field/index.js";
  import * as Sheet from "$lib/components/ui/sheet/index.js";

  // The shell every edit form on a detail screen shares (PRD-04 §4-2). A side panel rather than a
  // separate route: PRD-04 §3-3 gives these screens one URL, and the read view stays on screen
  // while the operator edits.
  //
  // A real form POST, not fetch: the write survives an island that failed to hydrate, and the
  // browser's own required/min/max validation runs before anything is sent.
  let {
    action,
    triggerLabel,
    title,
    description,
    submitLabel = "保存する",
    destructive = false,
    children,
  }: {
    action: string;
    triggerLabel: string;
    title: string;
    description: string;
    submitLabel?: string;
    /** For forms whose submit cannot be undone — a refund, not a field edit. */
    destructive?: boolean;
    children?: import("svelte").Snippet;
  } = $props();

  // Same reason as console-user-menu: a trigger that opens nothing reads as a dead control.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
</script>

<Sheet.Root>
  <Sheet.Trigger class={buttonVariants({ variant: "outline", size: "sm" })} disabled={!hydrated}>
    {triggerLabel}
  </Sheet.Trigger>
  <Sheet.Content side="right" class="w-full gap-0 sm:max-w-lg">
    <form method="post" {action} class="flex min-h-0 flex-1 flex-col">
      <Sheet.Header class="border-b">
        <Sheet.Title>{title}</Sheet.Title>
        <Sheet.Description>{description}</Sheet.Description>
      </Sheet.Header>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <Field.FieldGroup>
          {@render children?.()}
        </Field.FieldGroup>
      </div>

      <Sheet.Footer class="flex-row justify-end border-t">
        <Sheet.Close class={buttonVariants({ variant: "outline" })}>キャンセル</Sheet.Close>
        <Button type="submit" variant={destructive ? "destructive" : "default"}>{submitLabel}</Button>
      </Sheet.Footer>
    </form>
  </Sheet.Content>
</Sheet.Root>
