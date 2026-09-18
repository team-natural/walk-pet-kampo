<script lang="ts">
  // One of the five shared parts (GOV-01 D-019). Destructive actions in the shelter console go
  // through this: cancelling a walk notifies everyone booked, withdrawing ends the listing.
  //
  // A native <dialog> opened with showModal() brings the focus trap, the Esc key and the
  // backdrop with it. Rebuilding those by hand is how a custom modal ends up unreachable by
  // keyboard.
  interface Props {
    /** Where the confirmed action posts. */
    action: string;
    triggerLabel: string;
    title: string;
    message: string;
    confirmLabel: string;
  }

  let { action, triggerLabel, title, message, confirmLabel }: Props = $props();

  const titleId = $props.id();
  let dialog = $state<HTMLDialogElement | undefined>();
</script>

<button type="button" class="btn btn-quiet w-fit px-5 text-sm text-red-800" onclick={() => dialog?.showModal()}>
  {triggerLabel}
</button>

<dialog bind:this={dialog} class="card m-auto max-w-md p-0 backdrop:bg-black/40" aria-labelledby={titleId}>
  <div class="grid gap-4 p-6 sm:p-8">
    <h2 id={titleId} class="text-lg font-bold text-balance">{title}</h2>
    <p class="text-sm leading-relaxed text-pretty text-brand-ink-soft">{message}</p>

    <div class="flex flex-wrap justify-end gap-3">
      <button type="button" class="btn btn-quiet px-5 text-sm" onclick={() => dialog?.close()}>やめる</button>
      <form method="post" {action}>
        <button type="submit" class="btn btn-blossom px-5 text-sm">{confirmLabel}</button>
      </form>
    </div>
  </div>
</dialog>
