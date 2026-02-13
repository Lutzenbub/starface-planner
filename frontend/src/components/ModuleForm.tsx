import React, { useEffect, useState } from 'react';
import { ForwardingTarget, Module, Rule, TimeInterval } from '../types';
import { Button } from './Button';
import { Plus, Trash2, Clock, ArrowRightCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface ModuleFormProps {
  initialData?: Module | null;
  onSave: (module: Module) => void;
  onCancel: () => void;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FORWARDING_OPTIONS: ForwardingTarget[] = [
  'Mailbox',
  'Audio',
  'Nummer',
  'Audio + Nummer',
  'Audio + Mailbox',
  'Ansage',
  'Rufnummer',
  'Ansage + Rufnummer',
  'Ansage + Mailbox'
];

export const ModuleForm: React.FC<ModuleFormProps> = ({ initialData, onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [active, setActive] = useState(true);
  const [forwardingTarget, setForwardingTarget] = useState<ForwardingTarget>('');
  const [forwardingNumber, setForwardingNumber] = useState('');
  const [forwardingMailbox, setForwardingMailbox] = useState('');
  const [forwardingAnnouncement, setForwardingAnnouncement] = useState('');

  useEffect(() => {
    setName(initialData?.name ?? '');
    setPhoneNumber(initialData?.phoneNumber ?? '');
    setRules(initialData?.rules ?? []);
    setActive(initialData?.active ?? true);
    setForwardingTarget(initialData?.forwardingTarget ?? '');
    setForwardingNumber(initialData?.forwardingNumber ?? '');
    setForwardingMailbox(initialData?.forwardingMailbox ?? '');
    setForwardingAnnouncement(initialData?.forwardingAnnouncement ?? '');
  }, [initialData]);

  const addRule = () => {
    setRules([...rules, {
      id: uuidv4(),
      intervals: [],
      weekdays: []
    }]);
  };

  const removeRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const updateRule = (ruleId: string, updates: Partial<Rule>) => {
    setRules(rules.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  const addInterval = (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const newInterval: TimeInterval = {
      id: uuidv4(),
      start: '09:00',
      end: '17:00'
    };
    updateRule(ruleId, { intervals: [...rule.intervals, newInterval] });
  };

  const removeInterval = (ruleId: string, intervalId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    updateRule(ruleId, { intervals: rule.intervals.filter(i => i.id !== intervalId) });
  };

  const updateInterval = (ruleId: string, intervalId: string, field: 'start' | 'end', value: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const updatedIntervals = rule.intervals.map(i => 
      i.id === intervalId ? { ...i, [field]: value } : i
    );
    updateRule(ruleId, { intervals: updatedIntervals });
  };

  const updateDateRange = (ruleId: string, field: 'start' | 'end', value: string) => {
    const rule = rules.find((entry) => entry.id === ruleId);
    if (!rule) return;
    const currentRange = rule.dateRange ?? { start: '', end: '' };
    const nextRange = { ...currentRange, [field]: value };

    if (!nextRange.start && !nextRange.end) {
      updateRule(ruleId, { dateRange: undefined });
      return;
    }

    updateRule(ruleId, { dateRange: nextRange });
  };

  const toggleWeekday = (ruleId: string, dayIndex: number) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const currentDays = rule.weekdays || [];
    const newDays = currentDays.includes(dayIndex)
      ? currentDays.filter(d => d !== dayIndex)
      : [...currentDays, dayIndex];
    updateRule(ruleId, { weekdays: newDays });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const moduleToSave: Module = {
      id: initialData?.id || uuidv4(),
      name,
      phoneNumber,
      active,
      order: initialData?.order ?? 0,
      // Using 35% lightness for darker colors
      color: initialData?.color || `hsl(${Math.floor(Math.random() * 360)}, 70%, 35%)`,
      rules,
      forwardingTarget,
      forwardingNumber,
      forwardingMailbox,
      forwardingAnnouncement
    };
    onSave(moduleToSave);
  };

  // Determine visibility of extra fields
  const showNumberInput = ['Nummer', 'Audio + Nummer', 'Rufnummer', 'Ansage + Rufnummer'].some(opt => forwardingTarget?.includes(opt));
  const showMailboxInput = ['Mailbox', 'Audio + Mailbox', 'Ansage + Mailbox'].some(opt => forwardingTarget?.includes(opt));
  const showAnnouncementInput = ['Audio', 'Ansage'].some(opt => forwardingTarget?.includes(opt));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      
      {/* Base Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Module Name</label>
          <input 
            type="text" 
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="e.g. Sales Hotline"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Phone Number</label>
          <input 
            type="text" 
            required
            value={phoneNumber}
            onChange={e => setPhoneNumber(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            placeholder="+49 123 45678"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input 
          type="checkbox" 
          id="activeToggle"
          checked={active}
          onChange={e => setActive(e.target.checked)}
          className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-primary-600 focus:ring-primary-500 focus:ring-offset-gray-900"
        />
        <label htmlFor="activeToggle" className="text-sm font-medium text-gray-300">Module Active</label>
      </div>

      {/* Forwarding Section */}
      <div className="bg-gray-800/30 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4 text-primary-400">
           <ArrowRightCircle size={18} />
           <h3 className="text-md font-semibold text-white">Forwarding Destination</h3>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Umleitungsziel (Target)</label>
            <select
              value={forwardingTarget}
              onChange={(e) => setForwardingTarget(e.target.value as ForwardingTarget)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="">-- Select Target --</option>
              {FORWARDING_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {showNumberInput && (
               <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Rufnummer</label>
                  <input 
                    type="text" 
                    value={forwardingNumber}
                    onChange={e => setForwardingNumber(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="e.g. 0170123456"
                  />
               </div>
             )}
             {showMailboxInput && (
               <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Mailbox Nummer</label>
                  <input 
                    type="text" 
                    value={forwardingMailbox}
                    onChange={e => setForwardingMailbox(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="e.g. 200"
                  />
               </div>
             )}
             {showAnnouncementInput && (
               <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-400 mb-1">Ansage Bezeichnung</label>
                  <input 
                    type="text" 
                    value={forwardingAnnouncement}
                    onChange={e => setForwardingAnnouncement(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none"
                    placeholder="e.g. Welcome_Holiday.wav"
                  />
               </div>
             )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800 pt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-white">Rules</h3>
          <Button type="button" size="sm" onClick={addRule}>
            <Plus size={16} className="mr-1" /> Add Rule
          </Button>
        </div>

        <div className="space-y-4">
          {rules.length === 0 && (
            <div className="text-center py-8 text-gray-500 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
              No rules defined. This module will not run.
            </div>
          )}
          
          {rules.map((rule, index) => (
            <div key={rule.id} className="bg-gray-800/50 rounded-lg border border-gray-700 p-4 space-y-4">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rule #{index + 1}</span>
                <button type="button" onClick={() => removeRule(rule.id)} className="text-red-400 hover:text-red-300">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Date Conditions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Specific Date (Optional)</label>
                  <input 
                    type="date" 
                    value={rule.specificDate || ''}
                    onChange={e => updateRule(rule.id, { specificDate: e.target.value || undefined })}
                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date Range (Optional)</label>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      value={rule.dateRange?.start || ''}
                      onChange={e => updateDateRange(rule.id, 'start', e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                      placeholder="Start"
                    />
                    <input 
                      type="date" 
                      value={rule.dateRange?.end || ''}
                      onChange={e => updateDateRange(rule.id, 'end', e.target.value)}
                      className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm text-white"
                      placeholder="End"
                    />
                  </div>
                </div>
              </div>

              {/* Weekdays */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Weekdays (Optional)</label>
                <div className="flex flex-wrap gap-1">
                  {WEEKDAYS.map((day, i) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleWeekday(rule.id, i)}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        (rule.weekdays || []).includes(i) 
                          ? 'bg-primary-600 border-primary-500 text-white' 
                          : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {day.substring(0, 3)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Intervals */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-gray-400">Time Intervals</label>
                  <button type="button" onClick={() => addInterval(rule.id)} className="text-primary-400 text-xs hover:text-primary-300 flex items-center">
                    <Plus size={12} className="mr-1" /> Add Time
                  </button>
                </div>
                
                {(!rule.intervals || rule.intervals.length === 0) ? (
                   <p className="text-xs text-gray-500 italic">No intervals set = All Day (00:00 - 23:59)</p>
                ) : (
                  <div className="space-y-2">
                    {rule.intervals.map(interval => (
                      <div key={interval.id} className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-500" />
                        <input 
                          type="time" 
                          value={interval.start}
                          onChange={e => updateInterval(rule.id, interval.id, 'start', e.target.value)}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-primary-500 focus:outline-none"
                        />
                        <span className="text-gray-500">-</span>
                        <input 
                          type="time" 
                          value={interval.end}
                          onChange={e => updateInterval(rule.id, interval.id, 'end', e.target.value)}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:border-primary-500 focus:outline-none"
                        />
                        <button type="button" onClick={() => removeInterval(rule.id, interval.id)} className="text-red-400 hover:text-red-300 ml-2">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save Module</Button>
      </div>
    </form>
  );
};
