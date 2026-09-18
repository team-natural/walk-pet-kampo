<script lang="ts">
  // Plain markup, not shadcn: shadcn-svelte is admin-only (DEV-06 §5). Styling comes from the
  // shared .field / .btn classes in global.css so this matches the rest of the public site.
  import { onMount } from "svelte";

  const LANDING_ROUTE = "/mypage";

  const id = $props.id();

  let email = $state("");
  let password = $state("");
  let submitting = $state(false);
  // The island renders before its JS runs, and a submit in that window is a native POST that
  // silently loses the input.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  let fieldErrors = $state<Record<string, string[] | undefined>>({});
  let formError = $state("");

  // Mapped by status so the screen stays in one language. None of these distinguish "no such
  // account" from "wrong password" — that difference is an enumeration oracle.
  function messageFor(status: number) {
    if (status === 401) return "メールアドレスまたはパスワードが違います。";
    if (status === 429) return "試行回数が多すぎます。しばらく待ってからお試しください。";
    return "ログインできませんでした。時間をおいてお試しください。";
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return;

    submitting = true;
    fieldErrors = {};
    formError = "";

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        // replace() so Back doesn't return to an already-authenticated login form.
        window.location.replace(LANDING_ROUTE);
        return;
      }

      const body = (await response.json().catch(() => null)) as { errors?: Record<string, string[] | undefined> } | null;
      if (response.status === 422 && body?.errors) {
        fieldErrors = body.errors;
      } else {
        formError = messageFor(response.status);
      }
    } catch {
      formError = "サーバーに接続できませんでした。通信環境をご確認ください。";
    } finally {
      // Unreached on success (navigating away) — re-enabling first would allow a double submit.
      submitting = false;
    }
  }
</script>

<form class="grid w-full gap-4" onsubmit={handleSubmit}>
  {#if formError}
    <p role="alert" class="rounded-2xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>
  {/if}

  <label class="grid gap-1.5 text-sm" for="email-{id}">
    <span class="font-bold">メールアドレス</span>
    <input id="email-{id}" class="field w-full" type="email" autocomplete="username" spellcheck="false" bind:value={email} required aria-invalid={fieldErrors.email ? "true" : undefined} aria-describedby={fieldErrors.email ? `email-error-${id}` : undefined} />
    {#if fieldErrors.email}
      <p id="email-error-{id}" role="alert" class="text-sm text-red-800">{fieldErrors.email.join(" ")}</p>
    {/if}
  </label>

  <label class="grid gap-1.5 text-sm" for="password-{id}">
    <span class="font-bold">パスワード</span>
    <input id="password-{id}" class="field w-full" type="password" autocomplete="current-password" bind:value={password} required aria-invalid={fieldErrors.password ? "true" : undefined} aria-describedby={fieldErrors.password ? `password-error-${id}` : undefined} />
    {#if fieldErrors.password}
      <p id="password-error-{id}" role="alert" class="text-sm text-red-800">{fieldErrors.password.join(" ")}</p>
    {/if}
  </label>

  <button type="submit" class="btn btn-blossom px-6 py-3 disabled:opacity-60" disabled={!hydrated || submitting}>
    {submitting ? "ログインしています…" : "ログイン"}
  </button>
</form>
