<script lang="ts">
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { Badge } from "$lib/components/ui/badge/index.js";

  let { severity }: { severity: string } = $props();

  // P1 is the only severity that should pull the eye on sight; the rest stay quiet so it can.
  const variant = $derived(severity === "P1" ? "destructive" : severity === "P2" ? "secondary" : "outline");
</script>

<Badge {variant}>
  {#if severity === "P1"}
    <TriangleAlertIcon data-icon="inline-start" />
  {/if}
  {severity}
</Badge>
