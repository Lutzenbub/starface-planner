import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Module, EvaluatedBlock } from './types';
import {
  detectConflicts,
  ensureHex,
  evaluateRulesForDate,
  formatDate,
  formatDisplayDate,
  generateRandomColor,
  minutesToTime,
} from './utils';
import { Button } from './components/Button';
import { Modal } from './components/Modal';
import { ModuleForm } from './components/ModuleForm';
import { TimelineBlock } from './components/TimelineBlock';
import { Menu, Download, Upload, Plus, ChevronLeft, ChevronRight, Edit2, AlertOctagon, Copy, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import { loadModulesFromApi, saveModulesToApi } from './api/modulesApi';

const STORAGE_KEY = 'starface-planner-modules';

const parseDateInput = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

function App() {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSavingToServer, setIsSavingToServer] = useState(false);
  const [isLoadingFromServer, setIsLoadingFromServer] = useState(false);
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return;
    }
    try {
      const parsed = JSON.parse(saved) as Module[];
      if (Array.isArray(parsed)) {
        setModules(parsed);
      }
    } catch (error) {
      console.error('Failed to load modules from localStorage', error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  }, [modules]);

  const conflicts = useMemo(() => detectConflicts(modules, selectedDate), [modules, selectedDate]);
  const sortedModules = useMemo(() => [...modules].sort((a, b) => a.order - b.order), [modules]);
  const sortedActiveModules = useMemo(() => sortedModules.filter((module) => module.active), [sortedModules]);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingModuleId(null);
  };

  const openNewModuleModal = () => {
    setEditingModuleId(null);
    setIsModalOpen(true);
  };

  const openEditModuleModal = (id: string) => {
    setEditingModuleId(id);
    setIsModalOpen(true);
  };

  const handleSaveModule = (module: Module) => {
    setModules((previous) => {
      if (editingModuleId) {
        return previous.map((item) => (item.id === module.id ? module : item));
      }
      return [...previous, { ...module, order: previous.length }];
    });
    closeModal();
  };

  const moveModule = (index: number, direction: 'up' | 'down') => {
    const moved = [...sortedModules];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= moved.length) {
      return;
    }

    [moved[index], moved[swapIndex]] = [moved[swapIndex], moved[index]];
    moved.forEach((module, order) => {
      module.order = order;
    });

    setModules(moved.map((module) => ({ ...module })));
  };

  const updateModuleColor = (id: string, newColor: string) => {
    setModules((previous) => previous.map((module) => (module.id === id ? { ...module, color: newColor } : module)));
  };

  const handleDeleteModule = (id: string) => {
    if (!confirm('Delete this module?')) {
      return;
    }

    setModules((previous) =>
      previous
        .filter((module) => module.id !== id)
        .map((module, order) => ({ ...module, order })),
    );
  };

  const handleCopyModule = (id: string) => {
    const moduleToCopy = modules.find((module) => module.id === id);
    if (!moduleToCopy) {
      return;
    }

    const copiedModule: Module = {
      ...moduleToCopy,
      id: uuidv4(),
      name: `#${moduleToCopy.name}`,
      color: generateRandomColor(),
      rules: moduleToCopy.rules.map((rule) => ({
        ...rule,
        id: uuidv4(),
        intervals: rule.intervals.map((interval) => ({
          ...interval,
          id: uuidv4(),
        })),
      })),
    };

    const merged = [...sortedModules];
    const originalIndex = merged.findIndex((module) => module.id === id);
    merged.splice(originalIndex + 1, 0, copiedModule);
    merged.forEach((module, order) => {
      module.order = order;
    });

    setModules(merged.map((module) => ({ ...module })));
  };

  const handleExport = () => {
    const fileName = `starface-plan-${formatDate(new Date())}.json`;
    const data = JSON.stringify(modules, null, 2);
    const anchor = document.createElement('a');
    anchor.href = `data:text/json;charset=utf-8,${encodeURIComponent(data)}`;
    anchor.download = fileName;
    anchor.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const parsed = JSON.parse(loadEvent.target?.result as string);
        if (!Array.isArray(parsed)) {
          throw new Error('Invalid format');
        }
        const importedModules = parsed as Module[];
        setModules(importedModules.map((module, order) => ({ ...module, order: module.order ?? order })));
      } catch (_error) {
        alert('Invalid JSON format');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleSaveToServer = async () => {
    setIsSavingToServer(true);
    try {
      await saveModulesToApi(modules);
      alert('Module wurden am Server gespeichert.');
    } catch (error) {
      console.error(error);
      alert('Speichern am Server fehlgeschlagen.');
    } finally {
      setIsSavingToServer(false);
    }
  };

  const handleLoadFromServer = async () => {
    setIsLoadingFromServer(true);
    try {
      const serverModules = await loadModulesFromApi();
      setModules(serverModules.map((module, order) => ({ ...module, order: module.order ?? order })));
      alert('Module vom Server geladen.');
    } catch (error) {
      console.error(error);
      alert('Laden vom Server fehlgeschlagen.');
    } finally {
      setIsLoadingFromServer(false);
    }
  };

  const handleBlockUpdate = (block: EvaluatedBlock, newStart: number, newEnd: number) => {
    setModules((previous) => {
      const moduleIndex = previous.findIndex((module) => module.id === block.moduleId);
      if (moduleIndex === -1) {
        return previous;
      }

      const updatedModules = [...previous];
      const targetModule = { ...updatedModules[moduleIndex] };
      const ruleIndex = targetModule.rules.findIndex((rule) => rule.id === block.originalRuleId);

      if (ruleIndex === -1) {
        return previous;
      }

      const targetRule = { ...targetModule.rules[ruleIndex] };

      if (block.originalIntervalId === 'full-day') {
        targetRule.intervals = [{ id: uuidv4(), start: minutesToTime(newStart), end: minutesToTime(newEnd) }];
      } else {
        targetRule.intervals = targetRule.intervals.map((interval) =>
          interval.id === block.originalIntervalId
            ? { ...interval, start: minutesToTime(newStart), end: minutesToTime(newEnd) }
            : interval,
        );
      }

      targetModule.rules[ruleIndex] = targetRule;
      updatedModules[moduleIndex] = targetModule;
      return updatedModules;
    });
  };

  const timelineWidth = timelineContainerRef.current?.offsetWidth ?? 1200;

  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-200">
      
      {/* --- Sidebar --- */}
      <div className={`flex flex-col bg-gray-950 border-r border-gray-800 transition-all duration-300 ${isSidebarOpen ? 'w-80' : 'w-0'} overflow-hidden`}>
        <div className="p-4 border-b border-gray-800 flex items-center justify-between min-w-[320px]">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-500 to-blue-300 bg-clip-text text-transparent">Starface Planner</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-w-[320px]">
           {/* Actions */}
           <div className="grid grid-cols-2 gap-2 mb-6">
              <label className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 cursor-pointer transition-colors text-xs font-medium">
                <Upload size={14} /> Import
                <input type="file" accept=".json" className="hidden" onChange={handleImport} />
              </label>
              <button onClick={handleExport} className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 transition-colors text-xs font-medium">
                <Download size={14} /> Export
              </button>
           </div>
           <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={handleSaveToServer}
                disabled={isSavingToServer}
                className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 transition-colors text-xs font-medium disabled:opacity-50"
              >
                <Upload size={14} /> Save to Server
              </button>
              <button
                onClick={handleLoadFromServer}
                disabled={isLoadingFromServer}
                className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 transition-colors text-xs font-medium disabled:opacity-50"
              >
                <Download size={14} /> Load from Server
              </button>
           </div>

           <Button onClick={openNewModuleModal} className="w-full mb-4">
             <Plus size={16} className="mr-2" /> New Module
           </Button>

           <div className="space-y-2">
             {sortedModules.map((module, index) => (
               <div key={module.id} className={`group relative bg-gray-900 border rounded-lg p-3 transition-all min-h-[72px] flex items-center ${module.active ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800 opacity-60'}`}>
                 
                 {/* Reordering Controls (Left) */}
                 <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-2">
                    <button onClick={() => moveModule(index, 'up')} disabled={index === 0} className="text-gray-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronLeft size={12} className="rotate-90" /></button>
                    <button onClick={() => moveModule(index, 'down')} disabled={index === sortedModules.length - 1} className="text-gray-500 hover:text-white disabled:opacity-30 p-0.5"><ChevronLeft size={12} className="-rotate-90" /></button>
                 </div>

                 {/* Color Picker Wrapper */}
                 <div className="relative w-4 h-4 mr-3 shrink-0 rounded-full overflow-hidden border border-gray-700 hover:border-white transition-colors cursor-pointer" style={{ backgroundColor: module.color }}>
                   <input
                      type="color"
                      value={ensureHex(module.color)}
                      onChange={(e) => updateModuleColor(module.id, e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="Change color"
                      onClick={(e) => e.stopPropagation()}
                   />
                 </div>

                 {/* Info Text */}
                 <div className="flex-1 min-w-0" title={module.name}>
                    <div className="font-medium text-sm text-white break-words leading-tight">{module.name}</div>
                    <div className="text-xs text-gray-500 truncate mt-0.5">{module.phoneNumber}</div>
                 </div>

                 {/* Actions (Right) - Stacked Vertically, shrink-0 to prevent squashing */}
                 <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 z-10">
                    <button onClick={() => openEditModuleModal(module.id)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-primary-400 transition-colors" title="Edit Module">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleCopyModule(module.id)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-primary-400 transition-colors" title="Duplicate Module">
                      <Copy size={14} />
                    </button>
                    <button onClick={() => handleDeleteModule(module.id)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400 transition-colors" title="Delete Module">
                      <Trash2 size={14} />
                    </button>
                 </div>

                 {!module.active && <div className="absolute right-2 top-2 text-[10px] bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded border border-red-900/50 pointer-events-none">Inactive</div>}
               </div>
             ))}
           </div>
        </div>
      </div>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-950">
        
        {/* Header / Date Nav */}
        <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-950 z-20 shadow-md">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-1 border border-gray-800">
              <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white"><ChevronLeft size={16} /></button>
              <input 
                type="date" 
                value={formatDate(selectedDate)} 
                onChange={(event) => {
                  if (event.target.value) {
                    setSelectedDate(parseDateInput(event.target.value));
                  }
                }}
                className="bg-transparent border-none text-sm font-medium text-white focus:ring-0 text-center w-32" 
              />
              <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white"><ChevronRight size={16} /></button>
            </div>
            <div className="text-lg font-semibold text-white ml-4">
              {formatDisplayDate(selectedDate)} <span className="text-gray-500 text-sm font-normal ml-2">({selectedDate.toLocaleDateString('en-US', { weekday: 'long' })})</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {conflicts.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-900/30 border border-yellow-800 rounded-full text-yellow-500 text-xs font-medium animate-pulse">
                <AlertOctagon size={14} />
                <span>{conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Detected</span>
              </div>
            )}
            <div className="text-sm sm:text-base text-gray-200 whitespace-nowrap">
              <span className="font-bold">antony IT</span> Starface Planner
            </div>
          </div>
        </div>

        {/* Calendar Area */}
        <div className="flex-1 overflow-auto relative custom-scrollbar flex flex-col">
          
          {/* Time Header */}
          <div className="flex sticky top-0 z-30 bg-gray-950 border-b border-gray-800 h-10 min-w-[1200px]">
            <div className="w-48 flex-shrink-0 border-r border-gray-800 bg-gray-950 sticky left-0 z-40 flex items-center px-4 text-xs font-bold text-gray-500 tracking-wider">
              MODULES ({sortedActiveModules.length})
            </div>
            <div className="flex-1 relative flex">
              {hours.map(h => (
                <div key={h} className="flex-1 border-r border-gray-800/50 flex items-center justify-start text-[10px] text-gray-600 pl-1 font-mono">
                  {h.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="min-w-[1200px] flex-1 relative bg-gray-950" ref={timelineContainerRef}>
             
             {/* Background Grid Lines */}
             <div className="absolute inset-0 flex pl-48 pointer-events-none">
                {hours.map(h => (
                  <div key={h} className="flex-1 border-r border-gray-800/30 h-full relative">
                    {/* Half hour mark */}
                    <div className="absolute left-[50%] top-0 bottom-0 border-r border-gray-800/10 w-0"></div>
                  </div>
                ))}
             </div>

             {/* Module Rows */}
             <div className="relative">
               {sortedActiveModules.map((module) => {
                 // Get blocks for this module for this day
                 const evaluatedBlocks = evaluateRulesForDate(module.rules, selectedDate).map(res => ({
                   moduleId: module.id,
                   moduleName: module.name,
                   phoneNumber: module.phoneNumber,
                   startMinutes: res.start,
                   endMinutes: res.end,
                   priority: module.order,
                   color: module.color,
                   originalRuleId: res.ruleId,
                   originalIntervalId: res.intervalId,
                   // Mapping new fields
                   forwardingTarget: module.forwardingTarget,
                   forwardingNumber: module.forwardingNumber,
                   forwardingMailbox: module.forwardingMailbox,
                   forwardingAnnouncement: module.forwardingAnnouncement
                 }));

                 return (
                   <div key={module.id} className="flex h-16 border-b border-gray-800 hover:bg-white/[0.02] transition-colors group">
                     {/* Row Label */}
                     <div className="w-48 flex-shrink-0 border-r border-gray-800 sticky left-0 z-20 bg-gray-950 flex flex-col justify-center px-4 group-hover:bg-[#151b2b] transition-colors">
                        <span className="text-sm font-medium text-gray-200 truncate">{module.name}</span>
                        <span className="text-xs text-gray-500 truncate">{module.phoneNumber}</span>
                     </div>
                     
                     {/* Timeline Area */}
                     <div className="flex-1 relative">
                        {evaluatedBlocks.map((block, i) => (
                          <TimelineBlock 
                            key={`${block.originalRuleId}-${block.originalIntervalId}-${i}`}
                            block={block}
                            conflicts={conflicts}
                            totalWidth={timelineWidth}
                            onUpdate={handleBlockUpdate}
                            onEdit={() => openEditModuleModal(module.id)}
                          />
                        ))}
                     </div>
                   </div>
                 );
               })}
               
               {/* Empty State */}
               {sortedActiveModules.length === 0 && (
                 <div className="flex items-center justify-center h-64 text-gray-600">
                    <p>No active modules for this timeline.</p>
                 </div>
               )}
             </div>

          </div>
        </div>
      </div>

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        title={editingModuleId ? 'Edit Module' : 'Create New Module'}
      >
        <ModuleForm 
          initialData={modules.find(m => m.id === editingModuleId)}
          onSave={handleSaveModule}
          onCancel={closeModal}
        />
      </Modal>

    </div>
  );
}

export default App;
