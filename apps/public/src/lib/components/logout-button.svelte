<script lang="ts">
  // POST, not a link: logout deletes the walker_sessions row, and a GET that mutates state
  // would be triggerable by any <img> pointed at it.
  let submitting = $state(false);
  let error = $state("");

  async function handleLogout() {
    if (submitting) return;
    submitting = true;
    error = "";

    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST" });

      // 401 means the session was already gone (expired, or revoked elsewhere) — the walker is
      // logged out either way.
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

<div class="flex items-center gap-3">
  {#if error}
    <p role="alert" class="text-sm text-red-800">{error}</p>
  {/if}
  <button type="button" class="btn btn-quiet px-4 text-sm disabled:opacity-60" disabled={submitting} onclick={handleLogout}>
    {submitting ? "ログアウトしています…" : "ログアウト"}
  </button>
</div>
