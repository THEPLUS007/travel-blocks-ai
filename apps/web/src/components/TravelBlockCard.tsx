import { Copy, Edit3, ExternalLink, GripVertical, Link2, MapPin, MoreVertical, MoveRight, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { CATEGORY_LABELS, PRICE_LEVEL_LABELS } from '../constants/travel';
import type { TravelBlock, TravelDay } from '../types/travel';
import { getPriceBadgeTone } from '../utils/blockStyles';

interface TravelBlockCardProps {
  block: TravelBlock;
  dayId: string;
  days?: TravelDay[];
  draggable?: boolean;
  hideActions?: boolean;
  isMenuOpen?: boolean;
  onToggleMenu?: (blockId: string) => void;
  onCloseMenu?: () => void;
  onDragStart?: (dayId: string, blockId: string) => void;
  onDropOnBlock?: (dayId: string, blockId: string) => void;
  onEdit?: (dayId: string, block: TravelBlock) => void;
  onDelete?: (dayId: string, blockId: string) => void;
  onCopy?: (dayId: string, blockId: string) => void;
  onMoveToDay?: (sourceDayId: string, blockId: string, targetDayId: string) => void;
  onConnectStart?: (dayId: string, blockId: string) => void;
  onConnectTarget?: (dayId: string, blockId: string) => void;
  isConnectionSource?: boolean;
  isConnectionTarget?: boolean;
}

export function TravelBlockCard({
  block,
  dayId,
  days = [],
  draggable = true,
  hideActions = false,
  isMenuOpen = false,
  onToggleMenu,
  onCloseMenu,
  onDragStart,
  onDropOnBlock,
  onEdit,
  onDelete,
  onCopy,
  onMoveToDay,
  onConnectStart,
  onConnectTarget,
  isConnectionSource = false,
  isConnectionTarget = false,
}: TravelBlockCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const showActions = !hideActions && Boolean(onEdit || onDelete || onCopy || onMoveToDay || onConnectStart);
  const targetDays = days.filter((day) => day.id !== dayId);

  useEffect(() => {
    if (hideActions && isMenuOpen) {
      onCloseMenu?.();
    }
  }, [hideActions, isMenuOpen, onCloseMenu]);

  const ringClass = isConnectionSource
    ? 'border-myrealtrip-blue ring-2 ring-blue-100'
    : isConnectionTarget
      ? 'border-myrealtrip-mint ring-2 ring-teal-100'
      : 'border-slate-200';

  const runMenuAction = (action: () => void) => {
    action();
    onCloseMenu?.();
  };

  const openMapSearch = () => {
    const query = [block.location, block.title].filter(Boolean).join(' ');
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <article
      draggable={draggable && !hideActions}
      onClick={() => setIsExpanded((current) => !current)}
      onDragStart={() => {
        if (!hideActions) {
          onDragStart?.(dayId, block.id);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        if (!hideActions) {
          onDropOnBlock?.(dayId, block.id);
        }
      }}
      className={`rounded-lg border bg-white p-3 text-slate-950 shadow-sm transition hover:border-blue-200 hover:shadow-md ${ringClass} ${
        draggable && !hideActions ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start gap-3">
        {block.time ? (
          <div className="w-14 shrink-0 rounded-md bg-slate-50 px-2 py-1 text-center text-xs font-bold text-slate-700">
            {block.time}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
              {CATEGORY_LABELS[block.category]}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${getPriceBadgeTone(block.priceLevel)}`}>
              {PRICE_LEVEL_LABELS[block.priceLevel]}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-bold text-slate-950">{block.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {block.location ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin size={13} aria-hidden="true" />
                <span className="truncate">{block.location}</span>
              </span>
            ) : null}
            {block.estimatedCost ? <span className="font-semibold text-slate-800">{block.estimatedCost}</span> : null}
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-1">
          {draggable && !hideActions ? <GripVertical size={16} className="text-slate-300" aria-hidden="true" /> : null}
          {showActions ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggleMenu?.(block.id);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
              aria-label="블록 메뉴"
              title="블록 메뉴"
            >
              <MoreVertical size={16} aria-hidden="true" />
            </button>
          ) : null}
          {isMenuOpen && showActions ? (
            <div
              className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-slate-200 bg-white p-1.5 text-sm shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              {onEdit ? (
                <MenuButton label="수정" onClick={() => runMenuAction(() => onEdit(dayId, block))}>
                  <Edit3 size={14} aria-hidden="true" />
                </MenuButton>
              ) : null}
              {block.location || block.title ? (
                <MenuButton label="지도에서 보기" onClick={() => runMenuAction(openMapSearch)}>
                  <ExternalLink size={14} aria-hidden="true" />
                </MenuButton>
              ) : null}
              {onConnectStart ? (
                <MenuButton label="연결 시작" testId="connect-mode-button" onClick={() => runMenuAction(() => onConnectStart(dayId, block.id))}>
                  <Link2 size={14} aria-hidden="true" />
                </MenuButton>
              ) : null}
              {onCopy ? (
                <MenuButton label="복사" onClick={() => runMenuAction(() => onCopy(dayId, block.id))}>
                  <Copy size={14} aria-hidden="true" />
                </MenuButton>
              ) : null}
              {onMoveToDay && targetDays.length > 0 ? (
                <label className="mt-1 block rounded-md px-2 py-1.5 text-xs font-semibold text-slate-600">
                  Day 이동
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none"
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        onMoveToDay(dayId, block.id, event.target.value);
                        event.target.value = '';
                        onCloseMenu?.();
                      }
                    }}
                  >
                    <option value="">선택</option>
                    {targetDays.map((day) => (
                      <option key={day.id} value={day.id}>
                        Day {day.dayNumber} · {day.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {onDelete ? (
                <MenuButton danger label="삭제" onClick={() => runMenuAction(() => onDelete(dayId, block.id))}>
                  <Trash2 size={14} aria-hidden="true" />
                </MenuButton>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {block.memo ? (
        <p className={`mt-2 text-xs leading-5 text-slate-600 ${isExpanded ? '' : 'line-clamp-1'}`}>{block.memo}</p>
      ) : null}

      {isConnectionTarget && onConnectTarget ? (
        <button
          type="button"
          data-testid="connect-target-button"
          onClick={(event) => {
            event.stopPropagation();
            onConnectTarget(dayId, block.id);
          }}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-myrealtrip-mint bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 transition hover:bg-teal-100"
        >
          <MoveRight size={14} aria-hidden="true" />
          연결 대상으로 선택
        </button>
      ) : null}
    </article>
  );
}

function MenuButton({
  label,
  danger = false,
  onClick,
  testId,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-semibold transition ${
        danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
      {label}
    </button>
  );
}
