import { For } from "solid-js";
import type { CurrentChargesResponse, InvoicesResponse } from "../../api/types";
import { useRequest } from "../context/api";
import { useHints } from "../context/hints";
import { statusColor, useTheme } from "../context/theme";
import { Fields, Loaded, Panel, Table, RouteScroll } from "../ui/panel";

const money = (n: number) => `$${n.toFixed(2)}`;

export function Account() {
  const theme = useTheme();
  const charges = useRequest<CurrentChargesResponse>(
    () => "/account/current-charges",
  );
  const invoices = useRequest<InvoicesResponse>(() => "/account/invoices");
  useHints([]);

  return (
    <RouteScroll>
      <Panel title="Current billing cycle">
        <Loaded request={charges}>
          {(data) => (
            <box gap={1}>
              <Fields
                rows={[
                  {
                    label: "cycle",
                    value: `day ${data.charges.cycle.dayOfCycle} of ${data.charges.cycle.daysInCycle} · next charge ${new Date(data.charges.cycle.nextChargeAt).toISOString().slice(0, 10)}`,
                  },
                  { label: "accrued", value: money(data.charges.accruedTotal) },
                  { label: "credit", value: money(data.charges.ledger) },
                ]}
              />
              <Table
                rows={[...data.charges.items]
                  .sort((a, b) => b.accrued - a.accrued)
                  .slice(0, 12)}
                columns={[
                  { header: "resource", grow: true, value: (i) => i.name },
                  { header: "type", width: 12, value: (i) => i.type },
                  {
                    header: "accrued",
                    width: 10,
                    value: (i) => money(i.accrued),
                  },
                  {
                    header: "projected",
                    width: 10,
                    value: (i) => money(i.projected),
                  },
                ]}
              />
            </box>
          )}
        </Loaded>
      </Panel>
      <Panel title="Invoices" flexGrow={1}>
        <Loaded request={invoices}>
          {(data) => (
            <box>
              <For each={data.invoices.slice(0, 10)}>
                {(invoice) => (
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.text} width={12}>
                      {invoice.period}
                    </text>
                    <text fg={theme.text} width={12}>
                      {money(invoice.amount)}
                    </text>
                    <text
                      fg={statusColor(
                        theme,
                        invoice.status === "Paid" ? "success" : invoice.status,
                      )}
                    >
                      {invoice.status}
                    </text>
                  </box>
                )}
              </For>
            </box>
          )}
        </Loaded>
      </Panel>
    </RouteScroll>
  );
}
