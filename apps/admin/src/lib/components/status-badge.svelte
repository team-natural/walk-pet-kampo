<script lang="ts">
  import CircleAlertIcon from "@lucide/svelte/icons/circle-alert";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import ClockIcon from "@lucide/svelte/icons/clock";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { statusMeta, type StatusDomain } from "$lib/status";

  let { domain, value }: { domain: StatusDomain; value: string } = $props();

  const meta = $derived(statusMeta(domain, value));

  // PRD-04 §7: state is never carried by colour alone. The label always differs, and the three
  // tones an operator has to act on get an icon as well.
  const VARIANTS = { neutral: "outline", info: "secondary", positive: "default", warning: "secondary", danger: "destructive" } as const;
</script>

<Badge variant={VARIANTS[meta.tone]}>
  {#if meta.tone === "positive"}
    <CircleCheckIcon data-icon="inline-start" />
  {:else if meta.tone === "danger"}
    <CircleAlertIcon data-icon="inline-start" />
  {:else if meta.tone === "warning"}
    <ClockIcon data-icon="inline-start" />
  {/if}
  {meta.label}
</Badge>
