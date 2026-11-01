// The column sheet (the owner, 2026-11-01, the Holding map research's first
// proposal, "set it where you see it"): a column's rule, opened from its
// heading on the Lookbook's Map, in sentences, beside the grid it is about.
// What goes in the column, what a week with nothing for it does, its
// background, or never touch it; and what the rule gives on this week and the
// same service's last three, so a change is judged by its result, not read
// as a rule (Reeder et al.'s Expandable Grids; Zhang et al. on fixing rules
// from past events: docs/VISUALS_DASHBOARD.md § The Holding map rethought).
//
// It is the Holding map (../../shared/holding-map.ts), the same one Settings
// shows: a change here is a change there, saved on this computer at once, as
// Settings' switches are. Nothing here writes to Arena; the Lookbook's Load
// and Update all still ask first. Anyone reads it; only Admin changes it.

import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

import type { ArenaStatus } from '../../shared/arena.js'
import { holdingLayers, layerKeyOf, planPlacements, slotCode } from '../../shared/holding.js'
import {
	cellOf,
	defaultTakesWords,
	noneDefault,
	noneOf,
	ruleOf,
	takesOf,
	withRule,
	type HoldingMap,
	type LayerKey,
	type WhenNone,
} from '../../shared/holding-map.js'
import { mediaCodeOf, type LookbookItem, type LookbookRead, type LookbookService } from '../../shared/media-check.js'
import { holdingMapActions } from '../holdingMapStore.js'
import type { MediaCheckState } from '../useMediaCheck.js'
import { Input } from './form.js'

/** Columns whose items are a shared line (PROMO) or nothing (COUNTDOWN): no
 *  "what goes here" or "week with none" of their own. */
const isLine = (name: string) => /^\s*promo/i.test(name) && !/video|broadcast/i.test(name)
const isReserved = (name: string) => /count\s*down|video|broadcast/i.test(name)

/** `1 Nov`, from the lookbook's `2026-11-01`. */
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** The words a column starts from when someone first changes what it takes:
 *  its built-in rule, as words. */
function seedWords(name: string): string[] {
	const built = defaultTakesWords(name)
	if (/^Doors Open|^End/.test(built)) return built.split(', ')
	return [name.trim()]
}

type Week = { service: LookbookService; items: LookbookItem[] | null; detail?: string }

/** This service in the weeks before, with their run sheets: asked once per
 *  service, when a sheet first opens. */
function useEarlier(serviceId: string | null): { weeks: Week[]; loading: boolean; detail: string | null } {
	const [state, setState] = useState<{ id: string | null; weeks: Week[]; loading: boolean; detail: string | null }>({ id: null, weeks: [], loading: false, detail: null })
	useEffect(() => {
		const life = window.life
		if (serviceId === null || life === undefined || state.id === serviceId) return
		let live = true
		setState({ id: serviceId, weeks: [], loading: true, detail: null })
		void life.lookbookEarlier(serviceId).then(async (read: LookbookRead<LookbookService[]>) => {
			if (!read.ok) {
				if (live) setState({ id: serviceId, weeks: [], loading: false, detail: read.detail })
				return
			}
			const weeks = await Promise.all(
				read.value.map(async (service): Promise<Week> => {
					const r = await life.lookbookItems(service.id)
					return r.ok ? { service, items: r.value } : { service, items: null, detail: r.detail }
				}),
			)
			if (live) setState({ id: serviceId, weeks, loading: false, detail: null })
		})
		return () => {
			live = false
		}
	}, [serviceId])
	return state
}

/** What the rule gives column `column` (from 1) on one week's run sheet. */
function weekResult(items: LookbookItem[], status: ArenaStatus, map: HoldingMap, column: number, name: string, pins: MediaCheckState['pins']): { what: string; why: string } {
	const plan = planPlacements(items, status, map, pins)
	const held = [...plan.columns].find(([, c]) => c === column - 1)
	if (held !== undefined) {
		const [i] = held
		const item = items[i] as LookbookItem
		const codes = item.codes.map((raw) => mediaCodeOf(raw)?.code).filter((c): c is string => c !== undefined)
		const key = codes.find((c) => c[1] === 'F') ?? codes[0] ?? ''
		return { what: `${key} ${item.label ?? item.title}`.trim(), why: plan.notes.get(i) ?? plan.because.get(i) ?? '' }
	}
	if (isLine(name) || isReserved(name)) return { what: 'Nothing', why: isReserved(name) ? 'never touched' : 'no announcement left for it' }
	const none = noneOf(map, name)
	if (typeof none === 'object') return { what: none.code, why: 'nothing on the run sheet: the code set here' }
	return { what: 'Nothing for it', why: none === 'keep' ? 'keeps what is there' : 'what is there may be cleared' }
}

export function ColumnSheet({
	m,
	status,
	column,
	name,
	operator,
	onClose,
}: {
	m: MediaCheckState
	status: ArenaStatus
	/** Counted from 1. */
	column: number
	name: string
	operator: boolean
	onClose: () => void
}) {
	const map = m.map
	const items = m.runSheet ?? []
	const set = (change: Parameters<typeof withRule>[2]) => holdingMapActions.setMap(withRule(map, name, change))
	const changed = ruleOf(map, name) !== undefined
	const line = isLine(name)
	const reserved = isReserved(name)
	const takes = takesOf(map, name)
	const none = noneOf(map, name)
	const leaveAll = (['B', 'F', 'A'] as const).every((k) => cellOf(map, name, k).kind === 'leave')
	const layers = holdingLayers(status)
	const layerOf = (k: LayerKey) => layers.find((l) => layerKeyOf(l) === k)
	const fgSlot = layerOf('F')?.slots[column - 1]
	const holds = fgSlot === undefined ? null : slotCode(fgSlot)
	const bg = cellOf(map, name, 'B').kind
	const earlier = useEarlier(m.service?.id ?? null)
	const [word, setWord] = useState('')
	const [code, setCode] = useState(typeof none === 'object' ? none.code : '')
	const typedCode = mediaCodeOf(code.trim())
	const codeOk = typedCode !== null && typedCode.code === code.trim().toUpperCase()

	// The labels worth offering: this week's, then the words set already.
	const labels = [...new Set(items.filter((it) => it.codes.length > 0).map((it) => (it.label ?? '').trim()).filter((l) => l !== ''))]
	const words = takes ?? seedWords(name)
	const offered = [...new Set([...words, ...labels])]
	const toggle = (w: string) => {
		const on = words.some((x) => x.toLowerCase() === w.toLowerCase())
		const next = on ? words.filter((x) => x.toLowerCase() !== w.toLowerCase()) : [...words, w]
		set((r) => ({ ...r, takes: next }))
	}
	const setNone = (next: WhenNone | undefined) =>
		set((r) => {
			const { none: _old, ...rest } = r
			return next === undefined ? rest : { ...rest, none: next }
		})
	const setBg = (kind: 'auto' | 'normal' | 'item') => set((r) => ({ ...r, cells: { ...r.cells, B: { kind } } }))
	const setLeave = (on: boolean) =>
		set((r) => ({ ...r, cells: on ? { B: { kind: 'leave' }, F: { kind: 'leave' }, A: { kind: 'leave' } } : {} }))

	// "Put one code there": the code typed, else the one in the clip now.
	const putCode = () => {
		const next = codeOk && typedCode !== null ? typedCode.code : holds
		if (next === null) return
		setCode(next)
		setNone({ code: next })
	}

	const thisWeek = m.service === null || m.runSheet === null ? null : { service: m.service, items: m.runSheet }
	const weeks: Week[] = [...(thisWeek === null ? [] : [thisWeek]), ...earlier.weeks]

	return (
		<aside
			aria-label={`${name}, every week`}
			className="absolute top-0 right-0 z-20 flex max-h-full w-[440px] max-w-full flex-col gap-4 overflow-y-auto rounded-win border border-booth-edge bg-booth-panel p-4 shadow-2xl shadow-black/60"
		>
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<h3 className="text-xl font-extrabold tracking-tight">{name}, every week</h3>
					<p className="text-sm text-booth-dim">
						{changed ? 'Changed at this booth' : 'Built in'} · column {column}
					</p>
				</div>
				<button type="button" onClick={onClose} aria-label="Close" className="grid size-10 shrink-0 place-items-center rounded-ctl hover:bg-booth-hover">
					<X size={18} aria-hidden />
				</button>
			</div>

			{reserved ? (
				<p className="text-sm text-booth-dim">Named for something the lookbook does not fill, so Pāua never places, updates or clears anything here.</p>
			) : (
				<>
					<Section title="Never touch this column">
						<Choice on={leaveAll} operator={operator} onTap={() => setLeave(!leaveAll)} words={leaveAll ? 'On: nothing is placed, updated or cleared here' : 'Off'} />
					</Section>

					{!leaveAll && !line && (
						<Section title="What goes here">
							<p className="text-sm text-booth-ink">
								{takes === undefined ? defaultTakesWords(name) : takes.length === 0 ? 'Nothing from the run sheet' : `Items labelled or titled ${takes.join(', ')}`}
								{takes === undefined && <span className="text-booth-faint"> · built in</span>}
							</p>
							{operator && (
								<>
									<div className="flex flex-wrap gap-1.5">
										{offered.map((w) => {
											const on = words.some((x) => x.toLowerCase() === w.toLowerCase())
											return (
												<button
													key={w}
													type="button"
													aria-pressed={on}
													onClick={() => toggle(w)}
													className={`h-10 rounded-ctl px-3 text-sm ${on ? 'bg-accent font-bold text-accent-ink' : 'bg-booth-raise hover:bg-booth-hover'}`}
												>
													{w}
												</button>
											)
										})}
									</div>
									<form
										className="flex items-center gap-2"
										onSubmit={(e) => {
											e.preventDefault()
											if (word.trim() === '') return
											toggle(word.trim())
											setWord('')
										}}
									>
										<div className="min-w-0 flex-1">
											<Input value={word} onChange={setWord} placeholder="Another label" />
										</div>
										<button type="submit" disabled={word.trim() === ''} className="h-10 rounded-ctl bg-booth-raise px-3 text-sm hover:bg-booth-hover disabled:opacity-35">
											Add
										</button>
									</form>
									<p className="text-xs text-booth-faint">Tap a label to add or take it away. A label matches an item&rsquo;s label, or a word in its title.</p>
								</>
							)}
						</Section>
					)}

					{!leaveAll && !line && (
						<Section title="When a week has nothing for it">
							<Choice
								on={none === 'keep'}
								operator={operator}
								onTap={() => setNone(noneDefault(name) === 'keep' ? undefined : 'keep')}
								words={`Keep what’s there${holds !== null ? ` (${holds})` : ''}`}
								built={noneDefault(name) === 'keep'}
							/>
							<Choice
								on={none === 'clear'}
								operator={operator}
								onTap={() => setNone(noneDefault(name) === 'clear' ? undefined : 'clear')}
								words="Let Clear old FGs empty it"
								built={noneDefault(name) === 'clear'}
							/>
							<Choice
								on={typeof none === 'object'}
								operator={operator}
								onTap={putCode}
								words={typeof none === 'object' ? `Put ${none.code} there` : holds !== null ? `Put ${holds} there (the clip in it now)` : 'Put one code there'}
							/>
							{operator && (
								<div className="flex items-center gap-2">
									<div className="w-32">
										<Input value={code} onChange={setCode} placeholder="NF098" mono />
									</div>
									<button
										type="button"
										disabled={!codeOk}
										onClick={() => typedCode !== null && setNone({ code: typedCode.code })}
										className="h-10 rounded-ctl bg-booth-raise px-3 text-sm hover:bg-booth-hover disabled:opacity-35"
									>
										Use this code
									</button>
									{code.trim() !== '' && !codeOk && <span className="text-xs text-state-unreachable">Two letters, three digits</span>}
								</div>
							)}
						</Section>
					)}

					{!leaveAll && layerOf('B') !== undefined && (
						<Section title="Background">
							<Choice on={bg === 'auto'} operator={operator} onTap={() => setBg('auto')} words="The moment’s own; a gap gets the service’s normal background" built />
							<Choice on={bg === 'normal'} operator={operator} onTap={() => setBg('normal')} words="Always the service’s normal background" />
							<Choice on={bg === 'item'} operator={operator} onTap={() => setBg('item')} words="Only the moment’s own, never the normal one" />
						</Section>
					)}
				</>
			)}

			<Section title={earlier.weeks.length > 0 ? `This week and the last ${earlier.weeks.length}` : 'This week'}>
				<div className="flex flex-col gap-1.5">
					{weeks.map((w, i) => {
						const r = w.items === null ? null : weekResult(w.items, status, map, column, name, i === 0 ? m.pins : [])
						return (
							<div key={w.service.id} className="grid grid-cols-[4.5rem_1fr] gap-2 rounded-ctl bg-booth-raise px-3 py-2 text-sm">
								<span className="font-bold text-booth-dim">{shortDate(w.service.date)}</span>
								<span className="min-w-0">
									{r === null ? (
										<span className="text-warn">{w.detail ?? 'not read'}</span>
									) : (
										<>
											<span className="font-bold text-booth-ink">{r.what}</span>
											{r.why !== '' && <span className="block text-xs text-booth-dim">{r.why}</span>}
										</>
									)}
								</span>
							</div>
						)
					})}
					{earlier.loading && <p className="text-xs text-booth-faint">Reading the last few weeks from the lookbook…</p>}
					{earlier.detail !== null && <p className="text-xs text-warn">Earlier weeks not read: {earlier.detail}</p>}
					{!earlier.loading && earlier.detail === null && earlier.weeks.length === 0 && m.service !== null && <p className="text-xs text-booth-faint">No earlier weeks of this service in the lookbook.</p>}
					<p className="text-xs text-booth-faint">With the rule as it is now, against Arena&rsquo;s columns today.</p>
				</div>
			</Section>

			{operator && changed && (
				<button type="button" onClick={() => holdingMapActions.setMap(withRule(map, name, () => ({})))} className="h-10 self-start rounded-ctl px-3 text-sm text-booth-dim underline hover:bg-booth-hover hover:text-booth-ink">
					Back to built in
				</button>
			)}
			{!operator && <p className="text-xs text-booth-faint">Admin can change this.</p>}
		</aside>
	)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="text-xs font-bold tracking-wide text-booth-dim uppercase">{title}</h4>
			{children}
		</section>
	)
}

/** One choice of a rule: a row that is on or off; tapped only in Admin. */
function Choice({ on, operator, onTap, words, built = false }: { on: boolean; operator: boolean; onTap: () => void; words: string; built?: boolean }) {
	return (
		<button
			type="button"
			aria-pressed={on}
			disabled={!operator}
			onClick={onTap}
			className={`flex min-h-11 items-center gap-3 rounded-ctl px-3 py-2 text-left text-sm disabled:cursor-default ${on ? 'bg-accent text-accent-ink' : 'bg-booth-raise enabled:hover:bg-booth-hover'} ${!operator && !on ? 'opacity-60' : ''}`}
		>
			<span className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-accent-ink' : 'border-booth-dim'}`}>{on && <span className="size-1.5 rounded-full bg-accent-ink" />}</span>
			<span className="min-w-0 flex-1">{words}</span>
			{built && <span className={`text-xs ${on ? 'opacity-80' : 'text-booth-faint'}`}>built in</span>}
		</button>
	)
}
