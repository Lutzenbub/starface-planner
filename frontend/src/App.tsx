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
import { Menu, Download, Upload, Plus, ChevronLeft, ChevronRight, Edit2, AlertOctagon, Copy, Trash2, Link2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { addDays } from 'date-fns';
import {
  createInstance,
  listInstances,
  loadApiHealth,
  loadInstanceHealth,
  loadInstanceModules,
  resolveApiBaseUrl,
  syncInstance,
  type InstanceHealth,
  type InstanceSummary,
} from './api/modulesApi';
import { mapNormalizedPayloadToModules } from './api/moduleMapper';

const STORAGE_KEY = 'starface-planner-modules';

const parseDateInput = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toInstanceLabel = (instance: InstanceSummary | null): string => {
  if (!instance) {
    return 'STARFACE Login';
  }

  if (instance.displayName?.trim()) {
    return instance.displayName.trim();
  }

  try {
    return new URL(instance.baseUrl).host;
  } catch {
    return instance.baseUrl;
  }
};

function App() {
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStarfaceLoginModalOpen, setIsStarfaceLoginModalOpen] = useState(false);
  const [instances, setInstances] = useState<InstanceSummary[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState('');
  const [instanceHealth, setInstanceHealth] = useState<InstanceHealth | null>(null);
  const [instanceForm, setInstanceForm] = useState({
    baseUrl: '',
    username: '',
    password: '',
    displayName: '',
  });
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const [isRegisteringInstance, setIsRegisteringInstance] = useState(false);
  const [syncingInstanceId, setSyncingInstanceId] = useState<string | null>(null);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
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

  useEffect(() => {
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const checkBackend = async () => {
      try {
        const payload = await loadApiHealth();
        if (disposed) {
          return;
        }
        setIsBackendOnline(payload.ok);
        if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_API === 'true') {
          console.info('[starface-ui] backend health ok', {
            apiBaseUrl: resolveApiBaseUrl(),
            service: payload.service,
            timestamp: payload.timestamp,
          });
        }
      } catch (error) {
        if (!disposed) {
          setIsBackendOnline(false);
          if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_API === 'true') {
            console.warn('[starface-ui] backend health failed', {
              apiBaseUrl: resolveApiBaseUrl(),
              origin: window.location.origin,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    };

    void checkBackend();
    const interval = window.setInterval(() => {
      void checkBackend();
    }, 15000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const refreshInstances = async () => {
    try {
      const loadedInstances = await listInstances();
      setInstances(loadedInstances);
      if (!selectedInstanceId && loadedInstances.length > 0) {
        setSelectedInstanceId(loadedInstances[0].instanceId);
      }
    } catch (error) {
      console.error(error);
      setApiNotice('Instanzen konnten nicht geladen werden.');
    }
  };

  const refreshSelectedHealth = async (instanceId: string) => {
    try {
      const health = await loadInstanceHealth(instanceId);
      setInstanceHealth(health);
    } catch {
      setInstanceHealth(null);
    }
  };

  useEffect(() => {
    void refreshInstances();
  }, []);

  useEffect(() => {
    if (!selectedInstanceId) {
      setInstanceHealth(null);
      return;
    }

    void refreshSelectedHealth(selectedInstanceId);
  }, [selectedInstanceId]);

  const conflicts = useMemo(() => detectConflicts(modules, selectedDate), [modules, selectedDate]);
  const sortedModules = useMemo(() => [...modules].sort((a, b) => a.order - b.order), [modules]);
  const sortedActiveModules = useMemo(() => sortedModules.filter((module) => module.active), [sortedModules]);
  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.instanceId === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  );
  const isStarfaceLoggedIn = Boolean(selectedInstance && instanceHealth?.loginOk);
  const connectivityOnline = isBrowserOnline && isBackendOnline !== false;
  const connectivityLabel = connectivityOnline ? 'Online' : 'Offline';
  const loginButtonStyle: React.CSSProperties = isStarfaceLoggedIn
    ? {
        backgroundColor: 'rgba(16, 185, 129, 0.22)',
        borderColor: '#34d399',
        color: '#d1fae5',
      }
    : {
        backgroundColor: 'rgba(59, 130, 246, 0.24)',
        borderColor: '#60a5fa',
        color: '#dbeafe',
      };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingModuleId(null);
  };

  const openStarfaceLoginModal = () => {
    if (selectedInstance && !instanceForm.baseUrl.trim()) {
      setInstanceForm((current) => ({
        ...current,
        baseUrl: selectedInstance.baseUrl,
        displayName: selectedInstance.displayName ?? current.displayName,
      }));
    }
    setIsStarfaceLoginModalOpen(true);
  };

  const closeStarfaceLoginModal = () => {
    setIsStarfaceLoginModalOpen(false);
    setInstanceForm((current) => ({ ...current, password: '' }));
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

  const toMessage = (error: unknown): string => (error instanceof Error ? error.message : 'Unbekannter Fehler');

  const handleCreateInstance = async () => {
    setApiNotice(null);

    if (!instanceForm.baseUrl.trim() || !instanceForm.username.trim() || !instanceForm.password.trim()) {
      setApiNotice('Bitte Instanz, ID und Passwort ausfuellen.');
      return;
    }

    setIsRegisteringInstance(true);
    const start = performance.now();
    console.info('[starface-ui] login attempt started', {
      apiBaseUrl: resolveApiBaseUrl(),
      baseUrl: instanceForm.baseUrl.trim(),
      usernameLength: instanceForm.username.trim().length,
      hasPassword: Boolean(instanceForm.password),
      origin: window.location.origin,
    });
    try {
      const created = await createInstance({
        baseUrl: instanceForm.baseUrl.trim(),
        username: instanceForm.username.trim(),
        password: instanceForm.password,
        displayName: instanceForm.displayName.trim() || undefined,
      });
      setSelectedInstanceId(created.instanceId);
      await refreshInstances();
      await refreshSelectedHealth(created.instanceId);
      setApiNotice(`Login erfolgreich: ${created.baseUrl}`);
      setInstanceForm((current) => ({
        ...current,
        baseUrl: created.baseUrl,
        password: '',
      }));
      setIsStarfaceLoginModalOpen(false);
      console.info('[starface-ui] login attempt success', {
        instanceId: created.instanceId,
        normalizedBaseUrl: created.baseUrl,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (error) {
      console.error(error);
      setApiNotice(`Login fehlgeschlagen: ${toMessage(error)}`);
      console.error('[starface-ui] login attempt failed', {
        apiBaseUrl: resolveApiBaseUrl(),
        inputBaseUrl: instanceForm.baseUrl.trim(),
        durationMs: Math.round(performance.now() - start),
        error: toMessage(error),
      });
    } finally {
      setIsRegisteringInstance(false);
    }
  };

  const handleLoadFromStarface = async () => {
    if (!selectedInstanceId) {
      setApiNotice('Bitte zuerst ueber STARFACE Login anmelden.');
      setIsStarfaceLoginModalOpen(true);
      return;
    }

    setApiNotice(null);
    setSyncingInstanceId(selectedInstanceId);
    try {
      const payload = await loadInstanceModules(selectedInstanceId);
      const mappedModules = mapNormalizedPayloadToModules(payload).map((module, order) => ({
        ...module,
        order: module.order ?? order,
      }));
      setModules(mappedModules);
      setApiNotice(`Load from Starface erfolgreich (${payload.modules.length} Module).`);
      await refreshSelectedHealth(selectedInstanceId);
    } catch (error) {
      console.error(error);
      setApiNotice(`Load from Starface fehlgeschlagen: ${toMessage(error)}`);
    } finally {
      setSyncingInstanceId(null);
    }
  };

  const handleSaveToStarface = async () => {
    if (!selectedInstanceId) {
      setApiNotice('Bitte zuerst ueber STARFACE Login anmelden.');
      setIsStarfaceLoginModalOpen(true);
      return;
    }

    setApiNotice(null);
    setSyncingInstanceId(selectedInstanceId);
    try {
      const summary = await syncInstance(selectedInstanceId);
      const payload = await loadInstanceModules(selectedInstanceId);
      const mappedModules = mapNormalizedPayloadToModules(payload).map((module, order) => ({
        ...module,
        order: module.order ?? order,
      }));
      setModules(mappedModules);
      setApiNotice(`Save to Starface erfolgreich (${summary.modulesCount} Module, ${summary.rulesCount} Regeln).`);
      await refreshSelectedHealth(selectedInstanceId);
    } catch (error) {
      console.error(error);
      setApiNotice(`Save to Starface fehlgeschlagen: ${toMessage(error)}`);
    } finally {
      setSyncingInstanceId(null);
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
        <div className="min-w-[320px]">
          <div className="h-16 px-4 border-b border-gray-800 flex items-center">
            <h1 className="font-title text-lg font-bold text-gray-200">Starface Planner</h1>
          </div>
          <div className="h-12 px-4 border-b border-gray-800 bg-gray-950 flex items-center">
            <button
              onClick={openStarfaceLoginModal}
              disabled={isRegisteringInstance}
              className={`w-full h-9 rounded-lg border-2 text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                isStarfaceLoggedIn
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.35)]'
                  : 'border-blue-400/60 bg-blue-500/15 text-blue-100 hover:bg-blue-500/25'
              } disabled:opacity-70`}
              style={loginButtonStyle}
              title={isStarfaceLoggedIn ? toInstanceLabel(selectedInstance) : 'Login mit STARFACE Cloud'}
            >
              <Link2 size={14} />
              <span className={`h-2 w-2 rounded-full ${isStarfaceLoggedIn ? 'bg-emerald-300' : 'bg-blue-200'}`} />
              <span className="truncate">{isRegisteringInstance ? 'Login laeuft...' : toInstanceLabel(isStarfaceLoggedIn ? selectedInstance : null)}</span>
              <span
                className={`inline-flex h-2 w-2 rounded-full ${connectivityOnline ? 'bg-emerald-300' : 'bg-red-400'}`}
                title={connectivityLabel}
              />
            </button>
          </div>
          <div className="px-4 py-1 border-b border-gray-800 bg-gray-950 text-[10px] text-gray-400">
            STARFACE Verbindung: <span className={connectivityOnline ? 'text-emerald-300' : 'text-red-300'}>{connectivityLabel}</span>
          </div>
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
               onClick={() => void handleSaveToStarface()}
               disabled={Boolean(syncingInstanceId) || isRegisteringInstance}
               className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 transition-colors text-xs font-medium disabled:opacity-60"
             >
               <Upload size={14} /> {syncingInstanceId ? 'Saving...' : 'Save to Starface'}
             </button>
             <button
               onClick={() => void handleLoadFromStarface()}
               disabled={Boolean(syncingInstanceId) || isRegisteringInstance}
               className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-2 transition-colors text-xs font-medium disabled:opacity-60"
             >
               <Download size={14} /> {syncingInstanceId ? 'Loading...' : 'Load from Starface'}
             </button>
           </div>

           {apiNotice && (
             <div className="rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2 text-xs text-gray-300 mb-3">
               {apiNotice}
             </div>
           )}

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
            <div className="font-title text-sm sm:text-base text-gray-200 whitespace-nowrap">
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

      <Modal
        isOpen={isStarfaceLoginModalOpen}
        onClose={closeStarfaceLoginModal}
        title="STARFACE Cloud Login"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreateInstance();
          }}
        >
          <div>
            <label className="block text-sm text-gray-300 mb-1" htmlFor="starface-base-url">
              Instanz
            </label>
            <input
              id="starface-base-url"
              value={instanceForm.baseUrl}
              onChange={(event) => setInstanceForm((current) => ({ ...current, baseUrl: event.target.value }))}
              placeholder="name_der_instanz.starface-cloud.com"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gray-500"
              autoComplete="url"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1" htmlFor="starface-user-id">
              ID
            </label>
            <input
              id="starface-user-id"
              value={instanceForm.username}
              onChange={(event) => setInstanceForm((current) => ({ ...current, username: event.target.value }))}
              placeholder="ID"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gray-500"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1" htmlFor="starface-password">
              Passwort
            </label>
            <input
              id="starface-password"
              type="password"
              value={instanceForm.password}
              onChange={(event) => setInstanceForm((current) => ({ ...current, password: event.target.value }))}
              placeholder="Passwort"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gray-500"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1" htmlFor="starface-display-name">
              Anzeigename (optional)
            </label>
            <input
              id="starface-display-name"
              value={instanceForm.displayName}
              onChange={(event) => setInstanceForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="z. B. Kunde Nord"
              className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gray-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeStarfaceLoginModal}
              className="rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isRegisteringInstance}
              className="rounded-lg border border-primary-600 bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-500 transition-colors disabled:opacity-70"
            >
              {isRegisteringInstance ? 'Login...' : 'Login'}
            </button>
          </div>
        </form>
      </Modal>

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
