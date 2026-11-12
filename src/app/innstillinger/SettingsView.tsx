"use client";

import { useRef, useState } from "react";
import { Download, RotateCcw, Trash2, Upload } from "lucide-react";
import { actions, useAppData } from "@/lib/useAppData";
import { ImportError, parseAppData } from "@/lib/storage";
import type { AppData } from "@/lib/types";
import { Loading, PageHeader } from "@/components/ui";

type Msg = { kind: "ok" | "error"; text: string } | null;

export function SettingsView() {
  const data = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<AppData | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [confirm, setConfirm] = useState<"seed" | "clear" | null>(null);

  if (!data) return <Loading />;

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `butikkbrowser-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function onFile(file: File) {
    setMsg(null);
    try {
      const parsed = parseAppData(JSON.parse(await file.text()));
      setPending(parsed);
    } catch (err) {
      setMsg({
        kind: "error",
        text: err instanceof ImportError ? err.message : "Kunne ikke lese filen. Er det en gyldig JSON-eksport?",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyImport(mode: "merge" | "replace") {
    if (!pending) return;
    if (mode === "merge") actions.merge(pending);
    else actions.replaceAll(pending);
    setMsg({
      kind: "ok",
      text: `Importerte ${pending.stores.length} butikker og ${pending.categories.length} kategorier (${mode === "merge" ? "slått sammen" : "erstattet"}).`,
    });
    setPending(null);
  }

  return (
    <>
      <PageHeader title="Innstillinger" subtitle="Dataene lagres lokalt i denne nettleseren." />

      <section className="card mb-4 p-5">
        <h2 className="font-semibold">Eksport og import</h2>
        <p className="mt-1 text-sm text-muted">
          Last ned alle butikker og kategorier som JSON, f.eks. som backup eller for å flytte til en annen enhet.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={exportJson}>
            <Download className="size-4" /> Eksporter JSON
          </button>
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" /> Importer JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>

        {pending && (
          <div className="mt-4 rounded-xl bg-accent-soft p-4 text-sm">
            <p>
              Filen inneholder <strong>{pending.stores.length} butikker</strong> og{" "}
              <strong>{pending.categories.length} kategorier</strong>. Hvordan vil du importere?
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => applyImport("merge")}>
                Slå sammen
              </button>
              <button className="btn-secondary" onClick={() => applyImport("replace")}>
                Erstatt alt
              </button>
              <button className="btn-ghost" onClick={() => setPending(null)}>
                Avbryt
              </button>
            </div>
          </div>
        )}
        {msg && (
          <p
            role="status"
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              msg.kind === "ok" ? "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300" : "bg-red-50 text-danger dark:bg-red-500/10"
            }`}
          >
            {msg.text}
          </p>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Tilbakestill</h2>
        <p className="mt-1 text-sm text-muted">
          Du har {data.stores.length} butikker og {data.categories.length} kategorier. Eksporter først hvis du vil
          beholde dem.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {confirm ? (
            <>
              <button
                className="btn-danger"
                onClick={() => {
                  if (confirm === "seed") actions.resetToSeed();
                  else actions.clearAll();
                  setConfirm(null);
                  setMsg({ kind: "ok", text: confirm === "seed" ? "Eksempeldata er lastet inn." : "Alle data er slettet." });
                }}
              >
                Ja, {confirm === "seed" ? "erstatt med eksempeldata" : "slett alt"}
              </button>
              <button className="btn-ghost" onClick={() => setConfirm(null)}>
                Avbryt
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={() => setConfirm("seed")}>
                <RotateCcw className="size-4" /> Last inn eksempeldata
              </button>
              <button className="btn-danger" onClick={() => setConfirm("clear")}>
                <Trash2 className="size-4" /> Slett alt
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
