import { useNavigate } from "@tanstack/react-router";
import { Cog, Play, SearchIcon, Sparkles, Target, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { skillPath, useRatelApp } from "@/App";
import { Markdown } from "@/components/markdown";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderBackRow,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderSidebarTrigger,
  PageHeaderTitle,
} from "@/components/page-header";
import { ResponsiveToolbar, ResponsiveToolbarButton } from "@/components/responsive-toolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PixelProgress } from "@/components/ui/pixel-progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PrismSweep } from "@/components/ui/prism-sweep";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type AnalysisSettings,
  type Cadence,
  clearIntents,
  deleteIntent,
  fetchAnalysisSettings,
  fetchIntents,
  type IntentRecord,
  type IntentsIndex,
  offerSkill,
  runIntents,
  type SessionSummary,
  type SkillDraft,
  saveAnalysisSettings,
} from "@/lib/intents";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: IntentsIndex };

type View = "cumulative" | "by-session";

export function IntentsPage() {
  const { request, runAction, busy, openCommandMenu } = useRatelApp();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [view, setView] = useState<View>("cumulative");
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchIntents(request);
      setState({ status: "ready", data });
      return data;
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load intents",
      });
      return null;
    }
  }, [request]);

  // void-returning wrapper for child `onReload`/`onCleared` props.
  const reload = useCallback(async () => {
    await load();
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  // The run is fire-and-forget on the server; poll while it reports `running` so
  // results stream in and the banner clears itself when the run finishes.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const tick = async () => {
      const data = await load();
      if (!cancelled && data && !data.running) setRunning(false);
    };
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [running, load]);

  const runNow = useCallback(async () => {
    // Show the banner immediately so there's feedback even if the backend runs
    // synchronously (e.g. a stale dev server that hasn't picked up fire-and-forget).
    setRunning(true);
    const ok = await runAction("Analysis started", () => runIntents(request));
    const data = await load();
    // Keep the banner only while the server reports an in-flight run; the polling
    // effect clears it when that finishes. Otherwise (error, or a synchronous
    // backend with no `running` flag) clear it now — the results are already in.
    if (!ok || !data?.running) setRunning(false);
  }, [runAction, request, load]);

  const ready = state.status === "ready" ? state.data : null;
  const intents = ready?.intents ?? [];
  const sessions = ready?.sessions ?? [];
  const cadence = ready?.cadence;
  const analysisOff = ready?.enabled === false;

  return (
    <main className="flex w-full flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <PageHeader className="sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <PageHeaderContent>
          <PageHeaderBackRow>
            <PageHeaderTitle>Intents</PageHeaderTitle>
            <div className="flex items-center gap-1 sm:hidden">
              <Button
                aria-label="Search"
                onClick={openCommandMenu}
                size="icon-lg"
                type="button"
                variant="outline"
              >
                <SearchIcon />
                <span className="sr-only">Search</span>
              </Button>
              <PageHeaderSidebarTrigger />
            </div>
          </PageHeaderBackRow>
          <PageHeaderDescription>
            What you keep asking your agents to do, extracted from captured chat and matched against
            the skills Ratel manages. Gaps are intents no skill covers — offer a new skill to close
            them.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions className="hidden items-center sm:flex">
          <AnalysisSettingsDialog />
          <Button
            className="h-10"
            disabled={busy || running || analysisOff}
            onClick={() => void runNow()}
            size="sm"
          >
            {running ? <Spinner /> : <Play />}
            {running ? "Analyzing…" : "Run now"}
          </Button>
          <ResponsiveToolbar>
            <ResponsiveToolbarButton
              icon={<SearchIcon />}
              kbd="⌘K"
              label="Search"
              onClick={openCommandMenu}
            />
          </ResponsiveToolbar>
          <PageHeaderSidebarTrigger className="hidden sm:inline-flex" />
        </PageHeaderActions>
      </PageHeader>

      {state.status === "loading" && (
        <p className="px-1 text-muted-foreground text-sm">Loading intents…</p>
      )}

      {state.status === "error" && (
        <EmptyState title="Couldn't load intents" description={state.message}>
          <Button onClick={() => void load()} size="sm" variant="outline">
            Retry
          </Button>
        </EmptyState>
      )}

      {analysisOff && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          Analysis is off — chat isn't being captured and runs are disabled. Turn it on in{" "}
          <strong className="font-medium">Settings → Enabled</strong>.
        </div>
      )}

      {running && (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-sm">
          <PrismSweep size={22} dotSize={3} speed={1.3} />
          Analyzing chat through the extractor… results appear as each session finishes.
        </div>
      )}

      {!running && ready?.lastError && (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:border-amber-400/40 dark:bg-amber-500/15 dark:text-amber-200">
          Last analysis didn't finish: {ready.lastError}
        </div>
      )}

      {ready && intents.length === 0 && (
        <EmptyState
          title="No intents yet"
          description="Once the plugin captures some chat, run an analysis to extract what you've been trying to do. Make sure the Ratel plugin hooks are trusted in your agent."
        >
          <Button disabled={busy} onClick={() => void runNow()} size="sm">
            <Play />
            Run analysis
          </Button>
        </EmptyState>
      )}

      {ready && intents.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <Tabs onValueChange={(v) => setView(v as View)} value={view}>
              <TabsList>
                <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
                <TabsTrigger value="by-session">By session</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <span className="px-1 text-muted-foreground text-xs">
                {intents.length} intent{intents.length === 1 ? "" : "s"} ·{" "}
                {intents.filter((i) => i.coverage.status === "gap").length} gaps
                {cadence ? ` · due for analysis every ${cadence.everyNMessages} messages` : ""}
              </span>
              <ClearAllButton onCleared={reload} />
            </div>
          </div>

          {view === "cumulative" ? (
            <IntentList intents={intents} onReload={reload} />
          ) : (
            <BySessionView
              cadence={cadence}
              intents={intents}
              onReload={reload}
              sessions={sessions}
            />
          )}
        </>
      )}
    </main>
  );
}

function BySessionView(props: {
  intents: IntentRecord[];
  sessions: SessionSummary[];
  cadence?: Cadence;
  onReload: () => Promise<void>;
}) {
  if (props.sessions.length === 0) {
    return <p className="px-1 text-muted-foreground text-sm">No analyzed sessions yet.</p>;
  }
  // Newest first by analysis time.
  const sessions = [...props.sessions].sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt));
  return (
    <div className="grid gap-5">
      {sessions.map((session) => {
        const intents = props.intents.filter((i) => i.sessions.includes(session.sessionId));
        return (
          <section className="grid gap-2" key={session.sessionId}>
            <div className="px-1">
              <h2 className="truncate font-medium text-sm">
                {session.cwd ?? session.sessionId}{" "}
                <span className="text-muted-foreground">
                  ({session.intentCount} intent{session.intentCount === 1 ? "" : "s"},{" "}
                  {session.gapCount} gaps)
                </span>
              </h2>
              <p className="truncate text-muted-foreground text-xs">
                {session.host ?? "unknown"} · {session.sessionId}
                {cadenceProgress(session, props.cadence)}
              </p>
            </div>
            <IntentList intents={intents} onReload={props.onReload} />
          </section>
        );
      })}
    </div>
  );
}

/** " · 3/10 new messages since last analysis" when a session has accumulated turns. */
function cadenceProgress(session: SessionSummary, cadence?: Cadence): string {
  const newTurns = session.newTurnCount ?? 0;
  if (!cadence || newTurns === 0) return "";
  const remaining = Math.max(0, cadence.everyNMessages - newTurns);
  const tail = remaining === 0 ? "due now" : `${remaining} until due`;
  return ` · ${newTurns}/${cadence.everyNMessages} new since last analysis (${tail})`;
}

function IntentList(props: { intents: IntentRecord[]; onReload: () => Promise<void> }) {
  return (
    <ul className="grid gap-2">
      {props.intents.map((intent) => (
        <IntentRow intent={intent} key={intent.content} onReload={props.onReload} />
      ))}
    </ul>
  );
}

function IntentRow(props: { intent: IntentRecord; onReload: () => Promise<void> }) {
  const { intent } = props;
  const isGap = intent.coverage.status === "gap";
  return (
    <li className="flex items-start gap-3 rounded-md border border-border bg-card p-3">
      <Target className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <strong className="block font-medium">{intent.content}</strong>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <CoverageBadge intent={intent} />
          <span aria-hidden>·</span>
          <span>
            seen in {intent.sessions.length} session{intent.sessions.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isGap && <OfferSkillDialog intent={intent.content} onCreated={props.onReload} />}
        <DeleteIntentButton content={intent.content} onDeleted={props.onReload} />
      </div>
    </li>
  );
}

function DeleteIntentButton(props: { content: string; onDeleted: () => Promise<void> }) {
  const { request, runAction, busy } = useRatelApp();
  const onClick = async () => {
    const ok = await runAction("Deleted intent", () => deleteIntent(request, props.content));
    if (ok) await props.onDeleted();
  };
  return (
    <Button
      aria-label="Delete intent"
      disabled={busy}
      onClick={() => void onClick()}
      size="icon-sm"
      variant="ghost"
    >
      <Trash2 />
    </Button>
  );
}

function ClearAllButton(props: { onCleared: () => Promise<void> }) {
  const { request, runAction, busy } = useRatelApp();
  const [open, setOpen] = useState(false);
  const clear = async () => {
    const ok = await runAction("Cleared all intents", () => clearIntents(request));
    if (ok) {
      setOpen(false);
      await props.onCleared();
    }
  };
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Trash2 />
        Clear all
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear all intents?</DialogTitle>
          <DialogDescription>
            Removes every extracted intent from the list. They're re-extracted from captured chat
            the next time you run an analysis.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button size="sm" variant="outline" />}>Cancel</DialogClose>
          <Button disabled={busy} onClick={() => void clear()} size="sm" variant="destructive">
            Clear all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoverageBadge(props: { intent: IntentRecord }) {
  const { token } = useRatelApp();
  const navigate = useNavigate();
  const { coverage } = props.intent;

  if (coverage.status === "gap") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-amber-500/60" />
        Gap
      </span>
    );
  }

  // Quiet metadata-weight indicator; click to reveal the BM25-ranked skills as links.
  const count = coverage.skills.length;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
            type="button"
          />
        }
      >
        <span className="size-1.5 rounded-full bg-emerald-500/70" />
        Covered ({count})
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 gap-1 p-1">
        <p className="px-2 pt-1 text-muted-foreground text-xs">Matching skills (BM25)</p>
        <div className="grid">
          {coverage.skills.map((skill) => (
            <button
              className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
              key={skill.skillId}
              onClick={() => void navigate({ to: skillPath(skill.skillId, token) } as never)}
              type="button"
            >
              <span className="truncate font-mono text-xs">{skill.skillId}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {skill.score.toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OfferSkillDialog(props: { intent: string; onCreated: () => Promise<void> }) {
  const { request, runAction, busy } = useRatelApp();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "generating" | "error">("idle");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [progress, setProgress] = useState(0);
  const [filling, setFilling] = useState(false);

  // Fake progress while authoring: fast start, easing toward a cap over ~40s
  // (it never reaches 100 on its own). On completion `filling` pins it to 100.
  useEffect(() => {
    if (phase !== "generating" || filling) return;
    const start = performance.now();
    const CAP = 95;
    const TAU = 12000;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - start;
      setProgress(Math.min(CAP, CAP * (1 - Math.exp(-elapsed / TAU))));
    }, 150);
    return () => window.clearInterval(id);
  }, [phase, filling]);

  const generate = useCallback(async () => {
    setFilling(false);
    setProgress(0);
    setPhase("generating");
    setError("");
    try {
      const { draft } = await offerSkill(request, props.intent);
      setDraft(draft);
      setName(draft.name);
      setDescription(draft.description);
      setTags((draft.tags ?? []).join(", "));
      setBody(draft.body);
      setEditing(false);
      // Ramp to 100% fast, hold a beat so it's visible, then show the preview.
      setFilling(true);
      setProgress(100);
      window.setTimeout(() => {
        setPhase("idle");
        setFilling(false);
      }, 450);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Failed to generate a skill draft");
    }
  }, [request, props.intent]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !draft) void generate();
  };

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const create = async () => {
    const ok = await runAction(`Created skill ${name.trim()}`, () =>
      request("/api/skills", {
        method: "POST",
        body: { name: name.trim(), description: description.trim(), tags: tagList, body },
      }),
    );
    if (ok) {
      setOpen(false);
      await props.onCreated();
    }
  };

  const ready = phase === "idle" && draft;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Sparkles />
        Offer New Skills
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Offer a new skill</DialogTitle>
          <DialogDescription className="line-clamp-2">
            Drafted for “{props.intent}”. Review, optionally edit, then save — it writes a SKILL.md
            into Ratel's managed folder.
          </DialogDescription>
        </DialogHeader>

        {/* Only this middle region scrolls; header + footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {phase === "generating" && (
            <div className="grid gap-4 py-8">
              <div className="flex items-center gap-3">
                <PrismSweep dotSize={4} pattern="full" size={30} speed={1.4} />
                <PixelProgress className="flex-1" progress={progress} />
              </div>
              <p className="text-center font-medium text-sm">Authoring the skill…</p>
            </div>
          )}

          {phase === "error" && (
            <div className="grid gap-3 py-2">
              <p className="text-destructive text-sm">{error}</p>
              <p className="text-muted-foreground text-xs">
                Configure a skill generator in Settings (an Anthropic API key, or the local{" "}
                <code className="font-mono">claude</code> CLI on PATH), then try again.
              </p>
              <Button onClick={() => void generate()} size="sm" variant="outline">
                Retry
              </Button>
            </div>
          )}

          {ready && !editing && (
            <div className="grid gap-3">
              <div>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{name}</code>
                <p className="mt-1.5 font-medium text-sm">{description}</p>
              </div>
              {tagList.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tagList.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-md border border-border bg-card p-3">
                <Markdown>{body || "_(no instructions)_"}</Markdown>
              </div>
            </div>
          )}

          {ready && editing && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="offer-name">Name</Label>
                <Input id="offer-name" onChange={(e) => setName(e.target.value)} value={name} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="offer-description">Description</Label>
                <Textarea
                  id="offer-description"
                  onChange={(e) => setDescription(e.target.value)}
                  value={description}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="offer-tags">Tags (comma-separated)</Label>
                <Input id="offer-tags" onChange={(e) => setTags(e.target.value)} value={tags} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="offer-body">Instructions</Label>
                <Textarea
                  className="min-h-48 font-mono text-xs"
                  id="offer-body"
                  onChange={(e) => setBody(e.target.value)}
                  value={body}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button size="sm" variant="outline" />}>Cancel</DialogClose>
          {ready && (
            <Button onClick={() => setEditing((e) => !e)} size="sm" variant="outline">
              {editing ? "Preview" : "Edit"}
            </Button>
          )}
          <Button
            disabled={busy || !ready || name.trim() === ""}
            onClick={() => void create()}
            size="sm"
          >
            Create skill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AnalysisSettingsDialog() {
  const { request, runAction, busy } = useRatelApp();
  const [open, setOpen] = useState(false);
  const [secretMask, setSecretMask] = useState("");
  const [form, setForm] = useState<AnalysisSettings>({});
  // Numeric fields are kept as raw strings so partial input (e.g. "1.") types cleanly.
  const [nums, setNums] = useState<Record<string, string>>({});

  const update = (patch: AnalysisSettings) => setForm((prev) => ({ ...prev, ...patch }));
  const setNum = (key: string, value: string) => setNums((n) => ({ ...n, [key]: value }));

  const onOpenChange = async (next: boolean) => {
    setOpen(next);
    if (next) {
      try {
        const res = await fetchAnalysisSettings(request);
        const a = res.analysis ?? {};
        setForm(a);
        setSecretMask(res.secretMask);
        setNums({
          everyNMessages: numToStr(a.cadence?.everyNMessages),
          minScore: numToStr(a.coverage?.minScore),
          relativeRatio: numToStr(a.coverage?.relativeRatio),
          maxSkills: numToStr(a.coverage?.maxSkills),
        });
      } catch {
        setForm({});
      }
    }
  };

  const save = async () => {
    const next: AnalysisSettings = {
      ...form,
      cadence: { ...form.cadence, everyNMessages: numberOrUndefined(nums.everyNMessages) },
      coverage: {
        minScore: floatOrUndefined(nums.minScore),
        relativeRatio: floatOrUndefined(nums.relativeRatio),
        maxSkills: numberOrUndefined(nums.maxSkills),
      },
    };
    const ok = await runAction("Saved analysis settings", () =>
      saveAnalysisSettings(request, next),
    );
    if (ok) setOpen(false);
  };

  const cadence = form.cadence ?? {};
  const extractor = form.extractor ?? {};
  const skillGen = form.skillGen ?? {};
  const extractorProvider = extractor.provider ?? "naive";
  const skillGenProvider = skillGen.provider ?? "auto";

  return (
    <Dialog onOpenChange={(n) => void onOpenChange(n)} open={open}>
      <DialogTrigger render={<Button className="h-10" size="sm" variant="outline" />}>
        <Cog />
        Settings
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Analysis settings</DialogTitle>
          <DialogDescription>
            How chat is analyzed into intents, which model extracts them, how strictly they match
            skills, and how new skills are generated. Saved to your user-scope Ratel config.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1">
          <SettingRow
            control={
              <Switch
                checked={form.enabled ?? true}
                onCheckedChange={(v) => update({ enabled: v })}
              />
            }
            hint="When off, Ratel stops capturing chat and running intent analysis."
            label="Enabled"
          />

          <SettingsSection
            title="Cadence"
            hint="When analysis is due (manual Run now always works)."
          >
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <Field htmlFor="cadence-n" label="Every N messages">
                <Input
                  id="cadence-n"
                  inputMode="numeric"
                  onChange={(e) => setNum("everyNMessages", e.target.value)}
                  placeholder="10"
                  value={nums.everyNMessages ?? ""}
                />
              </Field>
              <SettingRow
                control={
                  <Switch
                    checked={cadence.onIdle ?? false}
                    onCheckedChange={(v) => update({ cadence: { ...cadence, onIdle: v } })}
                  />
                }
                hint="Also analyze when a session stops."
                label="On idle"
              />
            </div>
          </SettingsSection>

          <SettingsSection
            title="Extractor"
            hint="The model that turns chat into claims + intents."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <Select
                  onValueChange={(v) =>
                    update({ extractor: { ...extractor, provider: v as never } })
                  }
                  value={extractorProvider}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP endpoint (sidecar / remote)</SelectItem>
                    <SelectItem value="cloud">Cloud</SelectItem>
                    <SelectItem value="naive">Naive (no model)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {extractorProvider !== "naive" && (
                <Field htmlFor="ex-endpoint" label="Endpoint URL">
                  <Input
                    id="ex-endpoint"
                    onChange={(e) =>
                      update({ extractor: { ...extractor, endpoint: e.target.value } })
                    }
                    placeholder="http://127.0.0.1:8723"
                    value={extractor.endpoint ?? ""}
                  />
                </Field>
              )}
              {/* Model + key only matter for a cloud endpoint that serves multiple models;
                  the local sidecar serves whatever it was launched with and ignores them. */}
              {extractorProvider === "cloud" && (
                <>
                  <Field htmlFor="ex-model" label="Model">
                    <Input
                      id="ex-model"
                      onChange={(e) =>
                        update({ extractor: { ...extractor, model: e.target.value } })
                      }
                      placeholder="claim-extractor-4B"
                      value={extractor.model ?? ""}
                    />
                  </Field>
                  <Field htmlFor="ex-key" label="API key">
                    <Input
                      id="ex-key"
                      onChange={(e) =>
                        update({ extractor: { ...extractor, apiKey: e.target.value } })
                      }
                      placeholder={secretMask ? "•••• (saved)" : "required for cloud"}
                      type="password"
                      value={extractor.apiKey ?? ""}
                    />
                  </Field>
                </>
              )}
            </div>
            {extractorProvider === "http" && (
              <p className="px-1 text-muted-foreground text-xs">
                The sidecar serves whichever model it was started with — set it in the sidecar's{" "}
                <code className="font-mono">settings.json</code> (or{" "}
                <code className="font-mono">CLAIM_EXTRACTOR_MODEL</code>), not here.
              </p>
            )}
            {extractorProvider === "naive" && (
              <p className="px-1 text-muted-foreground text-xs">
                Naive mode needs no model — it records one intent per user message (good for testing
                the pipeline).
              </p>
            )}
          </SettingsSection>

          <SettingsSection
            title="Coverage matching"
            hint="How strictly intents match skills (BM25). Higher min score = fewer, stronger matches; lower relative cutoff = more skills per intent."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field htmlFor="cov-min" label="Min score">
                <Input
                  id="cov-min"
                  inputMode="decimal"
                  onChange={(e) => setNum("minScore", e.target.value)}
                  placeholder="1.0"
                  value={nums.minScore ?? ""}
                />
              </Field>
              <Field htmlFor="cov-ratio" label="Relative cutoff (0–1)">
                <Input
                  id="cov-ratio"
                  inputMode="decimal"
                  onChange={(e) => setNum("relativeRatio", e.target.value)}
                  placeholder="0.6"
                  value={nums.relativeRatio ?? ""}
                />
              </Field>
              <Field htmlFor="cov-max" label="Max skills">
                <Input
                  id="cov-max"
                  inputMode="numeric"
                  onChange={(e) => setNum("maxSkills", e.target.value)}
                  placeholder="4"
                  value={nums.maxSkills ?? ""}
                />
              </Field>
            </div>
          </SettingsSection>

          <SettingsSection title="Skill generation" hint="Used by “Offer New Skills”.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <Select
                  onValueChange={(v) => update({ skillGen: { ...skillGen, provider: v as never } })}
                  value={skillGenProvider}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (API key if set, else CLI)</SelectItem>
                    <SelectItem value="anthropic-api">Anthropic API</SelectItem>
                    <SelectItem value="claude-cli">Local claude CLI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {skillGenProvider !== "claude-cli" && (
                <Field htmlFor="sg-key" label="Anthropic API key">
                  <Input
                    id="sg-key"
                    onChange={(e) => update({ skillGen: { ...skillGen, apiKey: e.target.value } })}
                    placeholder={
                      secretMask
                        ? "•••• (saved)"
                        : skillGenProvider === "auto"
                          ? "optional"
                          : "required"
                    }
                    type="password"
                    value={skillGen.apiKey ?? ""}
                  />
                </Field>
              )}
            </div>
            {skillGenProvider === "claude-cli" && (
              <p className="px-1 text-muted-foreground text-xs">
                Uses your local <code className="font-mono">claude</code> CLI — no API key needed.
              </p>
            )}
          </SettingsSection>
        </div>

        <DialogFooter>
          <DialogClose render={<Button size="sm" variant="outline" />}>Cancel</DialogClose>
          <Button disabled={busy} onClick={() => void save()} size="sm">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsSection(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-md border border-border p-3">
      <legend className="px-1 font-medium text-sm">{props.title}</legend>
      {props.hint && <p className="-mt-1 px-1 text-muted-foreground text-xs">{props.hint}</p>}
      {props.children}
    </fieldset>
  );
}

function Field(props: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
    </div>
  );
}

function numToStr(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function floatOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function SettingRow(props: { label: string; hint?: string; control: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="grid gap-0.5">
        <span className="font-medium text-sm">{props.label}</span>
        {props.hint && <span className="text-muted-foreground text-xs">{props.hint}</span>}
      </div>
      {props.control}
    </div>
  );
}

function EmptyState(props: { title: string; description: string; children?: ReactNode }) {
  return (
    <section className="-mx-4 grid min-h-72 flex-1 place-items-center border-border border-y bg-muted/15 px-4 py-8 text-center sm:-mx-6 sm:px-6">
      <div className="grid max-w-md gap-3">
        <div className="mx-auto rounded-md bg-muted p-2 text-brand-green">
          <Target className="size-5" />
        </div>
        <div>
          <h3 className="font-medium">{props.title}</h3>
          <p className="mt-1 text-muted-foreground text-sm">{props.description}</p>
        </div>
        {props.children && <div>{props.children}</div>}
      </div>
    </section>
  );
}

function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
