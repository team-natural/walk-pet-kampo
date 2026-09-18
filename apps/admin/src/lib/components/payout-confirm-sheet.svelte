<script lang="ts">
  import EditSheet from "$lib/components/edit-sheet.svelte";
  import * as Field from "$lib/components/ui/field/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import { formatYen } from "$lib/format";
  import type { PayoutDetail } from "$lib/view-models/payout";

  // SYS-18's `aggregating -> confirmed` step, which DEV-04 §5-4-1 defines as one route carrying
  // the adjustment — not a separate "adjust" endpoint. A free-text reason cannot express an
  // amount, so this is a form rather than a confirmation dialog.
  let { payout, action }: { payout: PayoutDetail; action: string } = $props();

  const id = $props.id();
  let adjustment = $state(payout.adjustmentAmount);
  const total = $derived(payout.grossAmount + (Number.isFinite(adjustment) ? adjustment : 0));
</script>

<EditSheet {action} triggerLabel="集計を確定" title="集計を確定" description="確定すると団体側の還元明細に反映され、振込予定に進めます。" submitLabel="確定する">
  <Field.Field>
    <Field.FieldLabel>還元対象額</Field.FieldLabel>
    <p class="text-sm whitespace-nowrap tabular-nums">{formatYen(payout.grossAmount)}</p>
    <Field.FieldDescription>{payout.totalReservations} 件 / {payout.totalParticipants} 名の実施分です。</Field.FieldDescription>
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="adjustmentAmount-{id}">調整額</Field.FieldLabel>
    <Input id="adjustmentAmount-{id}" name="adjustmentAmount" type="number" inputmode="numeric" step={1} bind:value={adjustment} required />
    <Field.FieldDescription>返金や過誤の精算に使います。差し引く場合はマイナスで入力してください。</Field.FieldDescription>
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel for="notes-{id}">備考</Field.FieldLabel>
    <Textarea id="notes-{id}" name="notes" rows={3} value={payout.notes ?? ""} />
    <Field.FieldDescription>調整の根拠を残してください。団体側の明細にも表示されます。</Field.FieldDescription>
  </Field.Field>

  <Field.Field>
    <Field.FieldLabel>振込額</Field.FieldLabel>
    <p class="text-lg font-semibold whitespace-nowrap tabular-nums">{formatYen(total)}</p>
    <Field.FieldDescription>還元対象額に調整額を加えた、実際に振り込む金額です。</Field.FieldDescription>
  </Field.Field>
</EditSheet>
