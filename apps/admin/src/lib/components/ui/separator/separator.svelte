<script lang="ts">
  import { Separator as SeparatorPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let { ref = $bindable(null), class: className, "data-slot": dataSlot = "separator", ...restProps }: SeparatorPrimitive.RootProps = $props();
</script>

<!-- h-full where shadcn-svelte ships self-stretch: against a caller's h-*, stretch degrades to flex-start and pins the rule to the container's top edge. -->
<SeparatorPrimitive.Root bind:ref data-slot={dataSlot} class={cn("shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:h-full data-vertical:w-px", className)} {...restProps} />
