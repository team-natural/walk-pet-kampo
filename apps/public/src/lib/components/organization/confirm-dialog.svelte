<script lang="ts">
  // One of the five shared parts (GOV-01 D-019). Destructive actions in the shelter console go
  // through this: cancelling a walk notifies everyone booked, withdrawing ends the listing.
  //
  // A native <dialog> opened with showModal() brings the focus trap, the Esc key and the
  // backdrop with it. Rebuilding those by hand is how a custom modal ends up unreachable by
  // keyboard.
  interface Props {
    /** Where the confirmed action posts. Omit when `form` names one on the page. */
    action?: string;
    /** Id of a form elsewhere on the page. The confirm button submits it, fields included —
     * a dialog with its own empty form would drop whatever the page asked the user to type. */
    form?: string;
    triggerLabel: string;
    title: string;
    message: string;
    confirmLabel: string;
  }

  let { action, form, triggerLabel, title, message, confirmLabel }: Props = $props();

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
      {#if form}
        <button type="submit" {form} class="btn btn-blossom px-5 text-sm">{confirmLabel}</button>
      {:else}
        <form method="post" {action}>
          <button type="submit" class="btn btn-blossom px-5 text-sm">{confirmLabel}</button>
        </form>
      {/if}
    </div>
  </div>
</dialog>
