import { Edit3, GripVertical, Link2, MoreVertical, Plus, Search, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { CATEGORY_LABELS, PRICE_LEVEL_LABELS, TRANSPORT_MODE_LABELS } from '../constants/travel';
import { getDayPlaceScope, searchTravelPlacesWithFallback, type PlaceSearchResult } from '../services/placeSearchService';
import { getConnectableBlocks } from '../utils/connectionRules';
import type { PriceLevel, TransportMode, TravelBlock, TravelBlockCategory, TravelConnection, TravelDay } from '../types/travel';
import { TravelBlockCard } from './TravelBlockCard';

type BlockDraft = Omit<TravelBlock, 'id'>;
type BlockEditorState =
  | {
      mode: 'add';
      dayId: string;
    }
  | {
      mode: 'edit';
      dayId: string;
      block: TravelBlock;
    }
  | null;

interface DayBoardProps {
  days: TravelDay[];
  connections: TravelConnection[];
  selectedDayId: string;
  onSelectDay: (dayId: string) => void;
  onAddDay: () => void;
  onDeleteDay: (dayId: string) => void;
  onRenameDay: (dayId: string, title: string) => void;
  onDayDragStart: (dayId: string) => void;
  onDropDay: (dayId: string) => void;
  onAddBlock: (dayId: string, block: BlockDraft) => void;
  onUpdateBlock: (dayId: string, block: TravelBlock) => void;
  onDeleteBlock: (dayId: string, blockId: string) => void;
  onCopyBlock: (dayId: string, blockId: string) => void;
  onMoveBlockToDay: (sourceDayId: string, blockId: string, targetDayId: string) => void;
  onAddConnection: (dayId: string, sourceBlockId: string, targetBlockId: string) => void;
  onUpdateConnection: (connectionId: string, patch: Partial<Pick<TravelConnection, 'transportMode' | 'duration'>>) => void;
  onDeleteConnection: (connectionId: string) => void;
  onDragStart: (dayId: string, blockId: string) => void;
  onDropOnDay: (dayId: string) => void;
  onDropOnBlock: (dayId: string, blockId: string) => void;
}

const categoryOptions = Object.keys(CATEGORY_LABELS) as TravelBlockCategory[];
const priceOptions = Object.keys(PRICE_LEVEL_LABELS) as PriceLevel[];
const transportOptions = Object.keys(TRANSPORT_MODE_LABELS) as TransportMode[];

const emptyBlockDraft: BlockDraft = {
  title: '',
  category: 'sightseeing',
  priceLevel: 'medium',
  time: '',
  location: '',
  memo: '',
  estimatedCost: '',
};

export function DayBoard({
  days,
  connections,
  selectedDayId,
  onSelectDay,
  onAddDay,
  onDeleteDay,
  onRenameDay,
  onDayDragStart,
  onDropDay,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onCopyBlock,
  onMoveBlockToDay,
  onAddConnection,
  onUpdateConnection,
  onDeleteConnection,
  onDragStart,
  onDropOnDay,
  onDropOnBlock,
}: DayBoardProps) {
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [blockEditor, setBlockEditor] = useState<BlockEditorState>(null);
  const [connectingSource, setConnectingSource] = useState<{ dayId: string; blockId: string } | null>(null);
  const [openBlockMenuId, setOpenBlockMenuId] = useState<string | null>(null);
  const [openDayMenuId, setOpenDayMenuId] = useState<string | null>(null);
  const selectedDay = days.find((day) => day.id === selectedDayId) ?? days[0];

  useEffect(() => {
    const closeMenu = () => {
      setOpenBlockMenuId(null);
      setOpenDayMenuId(null);
    };

    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const startEditing = (day: TravelDay) => {
    setEditingDayId(day.id);
    setEditingTitle(day.title);
  };

  const submitRename = (dayId: string) => {
    onRenameDay(dayId, editingTitle);
    setEditingDayId(null);
    setEditingTitle('');
  };

  const requestDeleteDay = (day: TravelDay) => {
    if (days.length <= 1) {
      window.alert('Day 블록이 하나 남았습니다. 여행 일정에는 최소 1개의 Day가 필요합니다.');
      return;
    }

    if (window.confirm(`${day.title}를 삭제할까요? 포함된 블록도 함께 삭제됩니다.`)) {
      onDeleteDay(day.id);
    }
  };

  const requestDeleteBlock = (dayId: string, blockId: string) => {
    if (window.confirm('이 블록을 삭제할까요?')) {
      onDeleteBlock(dayId, blockId);
    }
  };

  const submitBlock = (dayId: string, draft: BlockDraft) => {
    if (blockEditor?.mode === 'edit') {
      onUpdateBlock(dayId, {
        ...draft,
        id: blockEditor.block.id,
      });
    } else {
      onAddBlock(dayId, draft);
    }
    setBlockEditor(null);
  };

  const startConnection = (dayId: string, blockId: string) => {
    setOpenBlockMenuId(null);
    setConnectingSource({ dayId, blockId });
  };

  const completeConnection = (dayId: string, targetBlockId: string) => {
    if (!connectingSource || connectingSource.dayId !== dayId) {
      return;
    }

    onAddConnection(dayId, connectingSource.blockId, targetBlockId);
    setConnectingSource(null);
  };

  if (days.length === 0) {
    return (
      <section className="flex min-h-96 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">아직 생성된 일정이 없습니다.</h2>
          <p className="mt-2 text-sm text-slate-600">여행 소스를 분석하면 Day별 블록 보드가 표시됩니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {days.map((day) => {
            const isSelected = day.id === selectedDayId;

            return (
              <button
                key={day.id}
                type="button"
                draggable={!connectingSource}
                onClick={() => onSelectDay(day.id)}
                onDragStart={() => onDayDragStart(day.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  onDropDay(day.id);
                }}
                className={`inline-flex max-w-44 items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-bold transition ${
                  isSelected
                    ? 'border-myrealtrip-blue bg-blue-50 text-myrealtrip-blue'
                    : 'border-transparent bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <GripVertical size={13} className="shrink-0 opacity-40" aria-hidden="true" />
                <span className="tracking-normal">DAY {day.dayNumber}</span>
                <span className="truncate text-xs font-medium text-slate-500">{day.title}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddDay}
            disabled={Boolean(connectingSource)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-myrealtrip-blue hover:text-myrealtrip-blue disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} aria-hidden="true" />
            Day 추가
          </button>
        </div>
      </div>

      {connectingSource ? (
        <div className="flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">연결할 대상 블록을 선택하세요.</span>
          <button
            type="button"
            onClick={() => setConnectingSource(null)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
          >
            <X size={14} aria-hidden="true" />
            연결 취소
          </button>
        </div>
      ) : null}

      <div className="grid gap-4">
        {selectedDay ? (
          <DayColumn
            key={selectedDay.id}
            day={selectedDay}
            days={days}
            connections={connections}
            connectingSource={connectingSource}
            openBlockMenuId={openBlockMenuId}
            openDayMenuId={openDayMenuId}
            isSelected
            editingDayId={editingDayId}
            editingTitle={editingTitle}
            onOpenBlockMenu={(blockId) => {
              setOpenDayMenuId(null);
              setOpenBlockMenuId((current) => (current === blockId ? null : blockId));
            }}
            onCloseBlockMenu={() => setOpenBlockMenuId(null)}
            onToggleDayMenu={(dayId) => {
              setOpenBlockMenuId(null);
              setOpenDayMenuId((current) => (current === dayId ? null : dayId));
            }}
            onCloseDayMenu={() => setOpenDayMenuId(null)}
            onEditingTitleChange={setEditingTitle}
            onStartEditing={startEditing}
            onSubmitRename={submitRename}
            onCancelEditing={() => setEditingDayId(null)}
            onSelectDay={onSelectDay}
            onDeleteDay={requestDeleteDay}
            onAddBlock={(dayId) => setBlockEditor({ mode: 'add', dayId })}
            onEditBlock={(dayId, block) => setBlockEditor({ mode: 'edit', dayId, block })}
            onDeleteBlock={requestDeleteBlock}
            onCopyBlock={onCopyBlock}
            onMoveBlockToDay={onMoveBlockToDay}
            onConnectStart={startConnection}
            onConnectTarget={completeConnection}
            onUpdateConnection={onUpdateConnection}
            onDeleteConnection={onDeleteConnection}
            onDragStart={onDragStart}
            onDropOnDay={onDropOnDay}
            onDropOnBlock={onDropOnBlock}
          />
        ) : null}
      </div>

      {blockEditor ? (
        <BlockEditorModal
          days={days}
          editor={blockEditor}
          onClose={() => setBlockEditor(null)}
          onSubmit={submitBlock}
        />
      ) : null}
    </section>
  );
}

interface DayColumnProps {
  day: TravelDay;
  days: TravelDay[];
  connections: TravelConnection[];
  connectingSource: { dayId: string; blockId: string } | null;
  openBlockMenuId: string | null;
  openDayMenuId: string | null;
  isSelected: boolean;
  editingDayId: string | null;
  editingTitle: string;
  onOpenBlockMenu: (blockId: string) => void;
  onCloseBlockMenu: () => void;
  onToggleDayMenu: (dayId: string) => void;
  onCloseDayMenu: () => void;
  onEditingTitleChange: (title: string) => void;
  onStartEditing: (day: TravelDay) => void;
  onSubmitRename: (dayId: string) => void;
  onCancelEditing: () => void;
  onSelectDay: (dayId: string) => void;
  onDeleteDay: (day: TravelDay) => void;
  onAddBlock: (dayId: string) => void;
  onEditBlock: (dayId: string, block: TravelBlock) => void;
  onDeleteBlock: (dayId: string, blockId: string) => void;
  onCopyBlock: (dayId: string, blockId: string) => void;
  onMoveBlockToDay: (sourceDayId: string, blockId: string, targetDayId: string) => void;
  onConnectStart: (dayId: string, blockId: string) => void;
  onConnectTarget: (dayId: string, blockId: string) => void;
  onUpdateConnection: (connectionId: string, patch: Partial<Pick<TravelConnection, 'transportMode' | 'duration'>>) => void;
  onDeleteConnection: (connectionId: string) => void;
  onDragStart: (dayId: string, blockId: string) => void;
  onDropOnDay: (dayId: string) => void;
  onDropOnBlock: (dayId: string, blockId: string) => void;
}

function DayColumn({
  day,
  days,
  connections,
  connectingSource,
  openBlockMenuId,
  openDayMenuId,
  isSelected,
  editingDayId,
  editingTitle,
  onOpenBlockMenu,
  onCloseBlockMenu,
  onToggleDayMenu,
  onCloseDayMenu,
  onEditingTitleChange,
  onStartEditing,
  onSubmitRename,
  onCancelEditing,
  onSelectDay,
  onDeleteDay,
  onAddBlock,
  onEditBlock,
  onDeleteBlock,
  onCopyBlock,
  onMoveBlockToDay,
  onConnectStart,
  onConnectTarget,
  onUpdateConnection,
  onDeleteConnection,
  onDragStart,
  onDropOnDay,
  onDropOnBlock,
}: DayColumnProps) {
  const isEditing = editingDayId === day.id;
  const isConnecting = Boolean(connectingSource);

  return (
    <div
      onClick={() => onSelectDay(day.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => {
        if (!isConnecting) {
          onDropOnDay(day.id);
        }
      }}
      className={`min-h-[620px] rounded-lg border bg-white p-5 transition ${
        isSelected ? 'border-myrealtrip-blue ring-2 ring-blue-100' : 'border-slate-200'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase text-myrealtrip-blue">Day {day.dayNumber}</p>
          {isEditing ? (
            <form
              className="mt-1 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitRename(day.id);
              }}
            >
              <input
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm font-semibold outline-none focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
                value={editingTitle}
                onChange={(event) => onEditingTitleChange(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                autoFocus
              />
              <button type="submit" className="rounded-lg bg-myrealtrip-blue px-2 py-1 text-xs font-semibold text-white">
                적용
              </button>
              <button type="button" onClick={onCancelEditing} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600">
                취소
              </button>
            </form>
          ) : (
            <h2 className="truncate text-lg font-bold text-slate-950">{day.title}</h2>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {day.blocks.length} blocks
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddBlock(day.id);
            }}
            disabled={isConnecting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-myrealtrip-blue px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus size={14} aria-hidden="true" />
            블록 추가
          </button>
          {!isConnecting ? (
            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={() => onToggleDayMenu(day.id)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
                aria-label="Day 옵션"
                title="Day 옵션"
              >
                <MoreVertical size={16} aria-hidden="true" />
              </button>
              {openDayMenuId === day.id ? (
                <div className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-semibold shadow-xl">
                  <button
                    type="button"
                    onClick={() => {
                      onStartEditing(day);
                      onCloseDayMenu();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-slate-700 hover:bg-slate-50"
                  >
                    <Edit3 size={14} aria-hidden="true" />
                    이름 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteDay(day);
                      onCloseDayMenu();
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Day 삭제
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div className="space-y-3">
        {day.blocks.length > 0 ? (
          day.blocks.map((block) => {
            const outgoingConnections = connections.filter(
              (connection) => connection.dayId === day.id && connection.sourceBlockId === block.id,
            );
            const sourceBlock = connectingSource?.dayId === day.id
              ? day.blocks.find((currentBlock) => currentBlock.id === connectingSource.blockId)
              : undefined;
            const connectableTargets = sourceBlock
              ? getConnectableBlocks(sourceBlock, day.blocks, connections, day.id)
              : [];
            const canBeConnectionTarget = connectableTargets.some((targetBlock) => targetBlock.id === block.id);
            const hasConnectableTargets = getConnectableBlocks(block, day.blocks, connections, day.id).length > 0;

            return (
              <div key={block.id} className="space-y-2">
                <TravelBlockCard
                  block={block}
                  dayId={day.id}
                  days={days}
                  hideActions={isConnecting}
                  isMenuOpen={openBlockMenuId === block.id}
                  onToggleMenu={onOpenBlockMenu}
                  onCloseMenu={onCloseBlockMenu}
                  onDragStart={onDragStart}
                  onDropOnBlock={onDropOnBlock}
                  onEdit={onEditBlock}
                  onDelete={onDeleteBlock}
                  onCopy={onCopyBlock}
                  onMoveToDay={onMoveBlockToDay}
                  onConnectStart={hasConnectableTargets ? onConnectStart : undefined}
                  onConnectTarget={canBeConnectionTarget ? onConnectTarget : undefined}
                  isConnectionSource={connectingSource?.dayId === day.id && connectingSource.blockId === block.id}
                  isConnectionTarget={canBeConnectionTarget}
                />
                {outgoingConnections.map((connection) => (
                  <ConnectionEdge
                    key={connection.id}
                    connection={connection}
                    targetBlock={day.blocks.find((targetBlock) => targetBlock.id === connection.targetBlockId)}
                    onUpdateConnection={onUpdateConnection}
                    onDeleteConnection={onDeleteConnection}
                  />
                ))}
              </div>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
            추천 블록을 추가하거나 + 버튼으로 새 블록을 만들 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

interface ConnectionEdgeProps {
  connection: TravelConnection;
  targetBlock?: TravelBlock;
  onUpdateConnection: (connectionId: string, patch: Partial<Pick<TravelConnection, 'transportMode' | 'duration'>>) => void;
  onDeleteConnection: (connectionId: string) => void;
}

function ConnectionEdge({ connection, targetBlock, onUpdateConnection, onDeleteConnection }: ConnectionEdgeProps) {
  return (
    <div className="ml-4 border-l-2 border-dashed border-myrealtrip-blue/40 pl-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
            <Link2 size={15} aria-hidden="true" />
            <span className="truncate">{targetBlock ? `${targetBlock.title}로 연결` : '연결 대상 없음'}</span>
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteConnection(connection.id);
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-white text-slate-600 transition hover:text-rose-600"
            aria-label="연결선 삭제"
            title="연결선 삭제"
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
          <select
            className="min-w-0 rounded-md border border-blue-100 bg-white px-2 py-1 text-xs font-semibold outline-none"
            value={connection.transportMode ?? 'walk'}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onUpdateConnection(connection.id, { transportMode: event.target.value as TransportMode })}
          >
            {transportOptions.map((transportMode) => (
              <option key={transportMode} value={transportMode}>
                {TRANSPORT_MODE_LABELS[transportMode]}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border border-blue-100 bg-white px-2 py-1 text-xs font-semibold outline-none"
            value={connection.duration ?? ''}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onUpdateConnection(connection.id, { duration: event.target.value })}
            placeholder="15분"
          />
        </div>
      </div>
    </div>
  );
}

interface BlockEditorModalProps {
  days: TravelDay[];
  editor: Exclude<BlockEditorState, null>;
  onClose: () => void;
  onSubmit: (dayId: string, draft: BlockDraft) => void;
}

function BlockEditorModal({ days, editor, onClose, onSubmit }: BlockEditorModalProps) {
  const [targetDayId, setTargetDayId] = useState(editor.dayId);
  const selectedDay = days.find((day) => day.id === targetDayId);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [draft, setDraft] = useState<BlockDraft>(
    editor.mode === 'edit'
      ? {
          title: editor.block.title,
          category: editor.block.category,
          priceLevel: editor.block.priceLevel,
          time: editor.block.time ?? '',
          location: editor.block.location ?? '',
          memo: editor.block.memo ?? '',
          estimatedCost: editor.block.estimatedCost ?? '',
        }
      : emptyBlockDraft,
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const updateDraft = (field: keyof BlockDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  useEffect(() => {
    let isActive = true;

    void searchTravelPlacesWithFallback({
      query: placeQuery || draft.location || draft.title,
      category: draft.category,
      ...getDayPlaceScope(selectedDay),
    }).then((results) => {
      if (isActive) {
        setPlaceResults(results);
      }
    }).catch(() => {
      if (isActive) {
        setPlaceResults([]);
      }
    });

    return () => {
      isActive = false;
    };
  }, [draft.category, draft.location, draft.title, placeQuery, selectedDay]);

  const applyPlace = (place: PlaceSearchResult) => {
    setDraft((current) => ({
      ...current,
      title: place.name,
      category: place.category,
      priceLevel: place.priceLevel,
      location: place.address,
      memo: place.memo,
      estimatedCost: place.estimatedCost,
    }));
    setPlaceQuery(place.name);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = draft.title.trim();

    if (!nextTitle) {
      return;
    }

    onSubmit(targetDayId, {
      ...draft,
      title: nextTitle,
      time: draft.time?.trim(),
      location: draft.location?.trim(),
      memo: draft.memo?.trim(),
      estimatedCost: draft.estimatedCost?.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-2xl" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-myrealtrip-blue">Travel Block</p>
            <h2 className="text-lg font-bold text-slate-950">{editor.mode === 'edit' ? '블록 수정' : '블록 추가'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="닫기"
            title="닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <section className="md:col-span-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="block flex-1">
                <span className="text-sm font-semibold text-blue-950">장소 검색</span>
                <div className="mt-1 flex rounded-lg border border-blue-100 bg-white focus-within:border-myrealtrip-blue focus-within:ring-2 focus-within:ring-blue-100">
                  <span className="flex items-center px-3 text-slate-400">
                    <Search size={16} aria-hidden="true" />
                  </span>
                  <input
                    className="min-w-0 flex-1 rounded-r-lg px-0 py-2 pr-3 text-sm outline-none"
                    value={placeQuery}
                    onChange={(event) => setPlaceQuery(event.target.value)}
                    placeholder={`${selectedDay?.region ?? selectedDay?.city ?? '여행지'} 장소 검색`}
                  />
                </div>
              </label>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {placeResults.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => applyPlace(place)}
                  className="rounded-lg border border-blue-100 bg-white p-3 text-left transition hover:border-myrealtrip-blue hover:shadow-sm"
                >
                  <span className="block text-sm font-bold text-slate-950">{place.name}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-600">
                    {CATEGORY_LABELS[place.category]} · {place.region} · {place.estimatedCost}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">제목</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.title}
              onChange={(event) => updateDraft('title', event.target.value)}
              placeholder="예: 성산일출봉 산책"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Day</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={targetDayId}
              onChange={(event) => setTargetDayId(event.target.value)}
            >
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  Day {day.dayNumber} · {day.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">카테고리</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.category}
              onChange={(event) => updateDraft('category', event.target.value as TravelBlockCategory)}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">시간</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.time}
              onChange={(event) => updateDraft('time', event.target.value)}
              placeholder="예: 09:00"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">비용 단계</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.priceLevel}
              onChange={(event) => updateDraft('priceLevel', event.target.value as PriceLevel)}
            >
              {priceOptions.map((priceLevel) => (
                <option key={priceLevel} value={priceLevel}>
                  {PRICE_LEVEL_LABELS[priceLevel]}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">위치</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.location}
              onChange={(event) => updateDraft('location', event.target.value)}
              placeholder="예: 성산일출봉"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">예상 비용</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.estimatedCost}
              onChange={(event) => updateDraft('estimatedCost', event.target.value)}
              placeholder="예: 18,000원"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-medium text-slate-700">설명</span>
            <textarea
              className="mt-1 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-myrealtrip-blue focus:ring-2 focus:ring-blue-100"
              value={draft.memo}
              onChange={(event) => updateDraft('memo', event.target.value)}
              placeholder="추천 이유나 이동 메모를 적어주세요."
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" className="rounded-lg bg-myrealtrip-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            적용
          </button>
        </div>
      </form>
    </div>
  );
}
