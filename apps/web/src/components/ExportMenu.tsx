import { Check, Clipboard, Download, Send, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TravelConnection, TravelDay, TripFormData } from '../types/travel';
import { copyTextToClipboard, formatShareText, downloadTravelPlanPdf } from '../utils/exportTravelPlan';

interface ExportMenuProps {
  trip: TripFormData;
  days: TravelDay[];
  connections: TravelConnection[];
}

export function ExportMenu({ trip, days, connections }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const canExport = days.length > 0;
  const exportInput = { trip, days, connections };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runAction = async (action: () => Promise<void> | void, nextStatus: string) => {
    await action();
    setStatus(nextStatus);
    window.setTimeout(() => setStatus(''), 1800);
  };

  const copyItineraryText = () => runAction(() => copyTextToClipboard(formatShareText(exportInput)), '일정 텍스트 복사됨');
  const copyShareText = () => runAction(() => copyTextToClipboard(formatShareText(exportInput)), '공유용 텍스트 복사됨');
  const savePdf = () => runAction(() => downloadTravelPlanPdf(exportInput), 'PDF 저장 창 열림');

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={!canExport}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-myrealtrip-blue px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Share2 size={16} aria-hidden="true" />
        내보내기
      </button>

      {isOpen ? (
        <div className="absolute left-1/2 top-11 z-40 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-xl sm:left-auto sm:right-0 sm:w-64 sm:translate-x-0">
          <div className="border-b border-slate-100 px-2 pb-2">
            <p className="font-bold text-slate-950">일정 내보내기</p>
            <p className="mt-0.5 text-xs text-slate-500">PDF 파일과 공유용 텍스트를 생성합니다.</p>
          </div>
          <div className="py-1.5">
            <ExportButton label="PDF로 저장" onClick={savePdf}>
              <Download size={15} aria-hidden="true" />
            </ExportButton>
            <ExportButton label="클립보드 복사" onClick={copyItineraryText}>
              <Clipboard size={15} aria-hidden="true" />
            </ExportButton>
            <ExportButton label="공유용 텍스트 생성" onClick={copyShareText}>
              <Send size={15} aria-hidden="true" />
            </ExportButton>
          </div>
          <div className="border-t border-slate-100 px-2 py-2 text-xs leading-5 text-slate-500">
            인쇄창 없이 정리된 PDF 파일을 바로 다운로드합니다.
          </div>
          {status ? (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-bold text-emerald-800">
              <Check size={14} aria-hidden="true" />
              {status}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ExportButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      {children}
      {label}
    </button>
  );
}
