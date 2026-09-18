<script lang="ts">
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Field from "$lib/components/ui/field/index.js";

  // SQLite has no boolean, so these are 0/1 integers (DEV-07).
  let { name, label, description, value }: { name: string; label: string; description?: string; value: number | null } = $props();

  const id = $props.id();
  let checked = $state(value === 1);
</script>

<!-- An unchecked box submits nothing at all, so the "0" companion goes first and the route reads
     the last value for this name. Without it, clearing a flag looks like omitting it. -->
<input type="hidden" {name} value="0" />
<Field.Field orientation="horizontal">
  <Checkbox id="{name}-{id}" {name} value="1" bind:checked />
  <Field.FieldContent>
    <Field.FieldLabel for="{name}-{id}">{label}</Field.FieldLabel>
    {#if description}
      <Field.FieldDescription>{description}</Field.FieldDescription>
    {/if}
  </Field.FieldContent>
</Field.Field>
