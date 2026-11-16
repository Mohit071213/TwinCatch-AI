import React, { useMemo, useState } from 'react';
import { Check, Layers, Search, Sparkles, X } from 'lucide-react';
import type { PromptLibraryCategory, VisualPromptTemplate } from '../types';
import { PROMPT_LIBRARY_CATEGORIES, VISUAL_PROMPT_LIBRARY } from '../lib/promptLibrary';

interface PromptLibraryModalProps {
  open: boolean;
  targetBeatIndex: number;
  currentBeatTemplateIds: Array<string | undefined>;
  onChangeTargetBeat: (beatIndex: number) => void;
  onSelectTemplate: (beatIndex: number, templateId: string) => void;
  onClose: () => void;
}

export const PromptLibraryModal: React.FC<PromptLibraryModalProps> = ({
  open,
  targetBeatIndex,
  currentBeatTemplateIds,
  onChangeTargetBeat,
  onSelectTemplate,
  onClose,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | PromptLibraryCategory>('All');

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return VISUAL_PROMPT_LIBRARY.filter((tpl) => {
      if (selectedCategory !== 'All' && tpl.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.category.toLowerCase().includes(q) ||
        tpl.directorPrompt.toLowerCase().includes(q) ||
        tpl.sampleCallout.toLowerCase().includes(q) ||
        tpl.motionGraphicPreset.toLowerCase().includes(q) ||
        tpl.shootingAngle.toLowerCase().includes(q) ||
        tpl.clipKeywords.some((kw) => kw.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  if (!open) return null;

  const activeTemplateId = currentBeatTemplateIds[targetBeatIndex];

  return (
    <div className="fixed inset-0 z-50 bg-[#242421]/65 flex items-center justify-center p-4">
      <div className="bg-[#FAF8F4] border border-[#E4DDD0] rounded-sm w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#FFFFFF] border-b border-[#E4DDD0] flex items-start justify-between gap-4">
          <div>
            <div className="text-[10.5px] font-mono uppercase tracking-[0.16em] text-[#B69A65] font-semibold inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Structured Visual Prompt-Library</span>
            </div>
            <h2 className="font-editorial text-[24px] text-[#242421] leading-tight mt-0.5">
              Select Dynamic Motion Preset for Beat {targetBeatIndex + 1}
            </h2>
            <p className="text-[12.5px] text-[#77766F] mt-0.5">
              Inspect Gemini Vision director prompts, animated motion-graphic layers, and camera choreography. Assigning a
              preset re-scores candidate scenes immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Prompt Library"
            className="p-2 border border-[#E4DDD0] bg-[#FAF8F4] hover:border-[#242421] rounded-sm text-[#242421] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Beat Switcher & Search + Category Filter Toolbar */}
        <div className="px-6 py-3.5 bg-[#F6F3EC] border-b border-[#E4DDD0] space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-[#77766F] mr-1">
                Target Beat:
              </span>
              {[0, 1, 2, 3, 4, 5].map((bIdx) => {
                const active = targetBeatIndex === bIdx;
                return (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => onChangeTargetBeat(bIdx)}
                    className={`px-2.5 py-1 text-[11.5px] font-mono rounded-sm border whitespace-nowrap shrink-0 transition-colors ${
                      active
                        ? 'bg-[#242421] text-[#F6F3EC] border-[#242421] font-semibold'
                        : 'bg-[#FFFFFF] text-[#242421] border-[#E4DDD0] hover:border-[#B69A65]'
                    }`}
                  >
                    Beat {bIdx + 1}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full lg:w-72">
              <Search className="w-3.5 h-3.5 text-[#77766F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search presets, cues, motions..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#FFFFFF] border border-[#E4DDD0] text-[12.5px] text-[#242421] rounded-sm focus:outline-none focus:border-[#242421]"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {PROMPT_LIBRARY_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 text-[11.5px] rounded-sm border whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[#242421] text-[#F6F3EC] border-[#242421] font-semibold'
                      : 'bg-[#FFFFFF] text-[#77766F] border-[#E4DDD0] hover:text-[#242421] hover:border-[#B69A65]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Preset Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-[#E4DDD0] bg-[#FFFFFF] rounded-sm space-y-1">
              <div className="text-[14px] font-semibold text-[#242421]">No matching visual presets found</div>
              <p className="text-[12.5px] text-[#77766F]">
                Try clearing your search filter or switching to another Prompt-Library category.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((tpl: VisualPromptTemplate) => {
                const isSelectedOnBeat = activeTemplateId === tpl.id;
                return (
                  <div
                    key={tpl.id}
                    className={`bg-[#FFFFFF] border rounded-sm p-4 flex flex-col justify-between gap-3 transition-colors ${
                      isSelectedOnBeat ? 'border-[#242421] ring-1 ring-[#242421]' : 'border-[#E4DDD0] hover:border-[#B69A65]'
                    }`}
                  >
                    <div className="space-y-2.5">
                      {/* Accent top rule */}
                      <div className="h-1 w-full rounded-sm" style={{ backgroundColor: tpl.colorAccent }} />

                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10.5px] font-mono uppercase tracking-[0.08em] text-[#77766F]">
                            {tpl.category} · {tpl.shootingAngle.replace(/_/g, ' ')} ·{' '}
                            {tpl.cameraMotion.replace(/_/g, ' ')}
                          </div>
                          <h3 className="text-[14.5px] font-semibold text-[#242421] leading-snug mt-0.5">
                            {tpl.name}
                          </h3>
                        </div>
                        {isSelectedOnBeat && (
                          <span className="text-[10.5px] font-mono uppercase font-semibold text-[#777D68] inline-flex items-center gap-1 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-[#8A5A1A] inline-flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-[#B69A65] shrink-0" />
                        <span>{tpl.motionGraphicPreset.replace(/_/g, ' ')}</span>
                      </div>

                      <p className="text-[12px] text-[#77766F] leading-relaxed">{tpl.directorPrompt}</p>

                      <div className="pt-2 border-t border-[#E4DDD0]/70 space-y-1">
                        <div className="text-[10px] font-mono uppercase tracking-[0.1em] text-[#77766F]">
                          {tpl.sampleSubBadge}
                        </div>
                        <div className="text-[12px] font-semibold text-[#242421]">{tpl.sampleCallout}</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E4DDD0] flex items-center justify-between gap-2">
                      <span className="text-[10.5px] font-mono text-[#77766F] truncate">
                        {tpl.clipKeywords[0]}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectTemplate(targetBeatIndex, tpl.id)}
                        className={`px-3 py-1.5 text-[11.5px] font-semibold rounded-sm whitespace-nowrap shrink-0 transition-colors ${
                          isSelectedOnBeat
                            ? 'bg-[#EFE8D8] text-[#242421] border border-[#242421]'
                            : 'bg-[#242421] text-[#F6F3EC] hover:bg-[#3A3934]'
                        }`}
                      >
                        {isSelectedOnBeat ? `Assigned Beat ${targetBeatIndex + 1}` : `Assign to Beat ${targetBeatIndex + 1}`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
