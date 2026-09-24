<script lang="ts">
  // F-07-04. The coordinates can only come from the browser, so this is the one part of SCR-06
  // that has to be client-side; everything else on the screen is a plain GET form.
  //
  // It fills the hidden inputs of the search form and submits it, rather than fetching JSON: the
  // result has to be a normal navigation so the URL carries the search (D-032's sibling rule —
  // a search you cannot link to is a search you cannot share).
  interface Props {
    /** Id of the search form on the page. */
    form: string;
  }

  let { form }: Props = $props();

  let state = $state<"idle" | "locating" | "denied" | "unsupported">("idle");

  function locate() {
    const element = document.getElementById(form);
    if (!(element instanceof HTMLFormElement)) return;

    if (!navigator.geolocation) {
      state = "unsupported";
      return;
    }

    state = "locating";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        (element.elements.namedItem("lat") as HTMLInputElement).value = String(position.coords.latitude);
        (element.elements.namedItem("lng") as HTMLInputElement).value = String(position.coords.longitude);
        element.submit();
      },
      () => {
        state = "denied";
      },
      { timeout: 10_000 },
    );
  }
</script>

<button type="button" class="btn btn-quiet px-4 text-sm" onclick={locate} disabled={state === "locating"}>
  {state === "locating" ? "現在地を取得中…" : "現在地からさがす"}
</button>

{#if state === "denied"}
  <p role="status" class="text-sm text-brand-ink-soft">現在地を取得できませんでした。エリア名で検索してください。</p>
{:else if state === "unsupported"}
  <p role="status" class="text-sm text-brand-ink-soft">このブラウザでは現在地を使えません。エリア名で検索してください。</p>
{/if}
