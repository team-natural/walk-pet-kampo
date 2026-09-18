<script lang="ts">
  import EditSheet from "$lib/components/edit-sheet.svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { formatYen } from "$lib/format";
  import type { PaymentSummary } from "$lib/view-models/reservation";

  // SYS-16. `refundPayment` takes an optional amount (DEV-04 §5-15), so partial refunds are in
  // scope and a yes/no confirmation cannot express the operation.
  let { payment, action }: { payment: PaymentSummary; action: string } = $props();

  const id = $props.id();
  let amount = $state(payment.amount);
  const partial = $derived(amount < payment.amount);
</script>

<EditSheet {action} triggerLabel="返金する" title="返金する" description="Stripe に返金を依頼します。参加者への着金までは数営業日かかります。" submitLabel="返金する" destructive>
  <Field.Field>
    <Field.FieldLabel>決済額</Field.FieldLabel>
    <p class="text-sm whitespace-nowrap tabular-nums">{formatYen(payment.amount)}</p>
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="amount-{id}">返金額</Field.FieldLabel>
    <Input id="amount-{id}" name="amount" type="number" inputmode="numeric" min={1} max={payment.amount} step={1} bind:value={amount} required />
    <Field.FieldDescription>
      {#if partial}
        一部返金になります。残り {formatYen(payment.amount - amount)} は返金されません。
      {:else}
        全額を返金します。
      {/if}
    </Field.FieldDescription>
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="reason-{id}">返金の理由</Field.FieldLabel>
    <Textarea id="reason-{id}" name="reason" rows={3} required />
    <Field.FieldDescription>操作履歴に残ります。団体への還元額もあわせて調整されます。</Field.FieldDescription>
  </Field.Field>

  <p class="text-sm font-medium text-destructive" role="note">返金は取り消せません。</p>
</EditSheet>
