'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Save, Wand2, Trash2, RotateCcw } from 'lucide-react';

type ExtractStatus = 'idle' | 'uploading' | 'reviewing' | 'saving' | 'success';

export default function DataIngestionPage() {
    const [status, setStatus] = useState<ExtractStatus>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [companies, setCompanies] = useState<any[]>([]);
    const [people, setPeople] = useState<any[]>([]);
    const [meetings, setMeetings] = useState<any[]>([]);

    const [activeTab, setActiveTab] = useState<'companies' | 'people' | 'meetings'>('companies');

    const fileInput = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        const file = e.target.files[0];

        try {
            setStatus('uploading');
            setErrorMsg(null);
            
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch('/api/admin/data-ingestion/extract', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to extract data');
            }

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setCompanies(data.companies || []);
            setPeople(data.people || []);
            setMeetings(data.meetings || []);

            setStatus('reviewing');
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "An unknown error occurred during uploading");
            setStatus('idle');
        }
    };

    const validateForms = () => {
        // Companies
        for (const c of companies) {
            if (!c.name || c.name.trim() === '') return { valid: false, error: "Company name is required." };
        }
        // People
        for (const p of people) {
            if (!p.name || p.name.trim() === '') return { valid: false, error: `Person name is missing for someone.` };
            if (!p.email || p.email.trim() === '') return { valid: false, error: `Person email is missing for ${p.name || 'Unknown'}.` };
            if (!p.companyName || p.companyName.trim() === '') return { valid: false, error: `Company name is missing for ${p.name}.` };
            if (!p.title || p.title.trim() === '') return { valid: false, error: `Title is missing for ${p.name}.` };
        }
        // Meetings
        for (const m of meetings) {
            if (!m.title || m.title.trim() === '') return { valid: false, error: "Meeting title is required." };
        }
        return { valid: true };
    };

    const handleSave = async () => {
        const check = validateForms();
        if (!check.valid) {
            setErrorMsg(check.error || "Validation failed");
            return;
        }

        try {
            setStatus('saving');
            setErrorMsg(null);

            const res = await fetch('/api/admin/data-ingestion/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companies, people, meetings })
            });

            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Failed to save');

            setStatus('success');
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || 'Failed to save data. Ensure relations are properly resolved.');
            setStatus('reviewing');
        }
    };

    const updateEntity = (entity: any, index: number, field: string, value: any, setFn: any, list: any[]) => {
        const updated = [...list];
        updated[index] = { ...updated[index], [field]: value };
        setFn(updated);
    };

    const removeEntity = (idx: number, type: 'companies' | 'people' | 'meetings') => {
        if (type === 'companies') setCompanies(c => c.filter((_, i) => i !== idx));
        if (type === 'people') setPeople(c => c.filter((_, i) => i !== idx));
        if (type === 'meetings') setMeetings(c => c.filter((_, i) => i !== idx));
    };

    // Helper for AI highlight
    const isAiSuggested = (obj: any, fieldName: string) => {
        const list = obj.aiSuggestedFields || [];
        return list.includes(fieldName);
    };

    const FieldEditor = ({ obj, idx, field, label, required = false, type = 'text', setFn, list }: any) => {
        const predicted = isAiSuggested(obj, field);
        const hasError = required && (!obj[field] || String(obj[field]).trim() === '');
        
        const existingVal = obj.existingRecord ? obj.existingRecord[field] : undefined;
        const stringifyObjVal = obj[field] !== null && obj[field] !== undefined ? String(obj[field]) : '';
        const stringifyExistingVal = existingVal !== null && existingVal !== undefined ? String(existingVal) : '';
        const hasConflict = obj.existingRecord && stringifyExistingVal !== '' && stringifyExistingVal !== stringifyObjVal;

        const revertToDb = () => {
            updateEntity(obj, idx, field, existingVal, setFn, list);
        };
        
        return (
            <div className="flex flex-col space-y-1 my-2 border-l-2 pl-3 pb-2
                transition-all duration-300 relative
                hover:border-zinc-400 group
                border-zinc-100"
            >
                <div className="flex justify-between items-center text-xs text-zinc-500 font-medium">
                    <span>
                        {label} {required && <span className="text-red-500">*</span>}
                    </span>
                    {predicted && (
                        <div className="flex items-center text-amber-600 bg-amber-50 px-2 rounded-full py-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
                            <Wand2 className="w-3 h-3 mr-1" />
                            AI Suggested
                        </div>
                    )}
                </div>
                
                {type === 'boolean' ? (
                    <select
                        value={obj[field] === true ? 'true' : obj[field] === false ? 'false' : ''}
                        onChange={e => updateEntity(obj, idx, field, e.target.value === 'true', setFn, list)}
                        className={`text-sm py-1 border-b bg-transparent outline-none transition-colors 
                            ${predicted ? 'border-amber-300 bg-amber-50 rounded-sm px-1' : 'border-zinc-200 focus:border-zinc-800'}
                            ${hasError ? 'border-red-500 bg-red-50' : ''}`}
                    >
                        <option value="">Unknown</option>
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                ) : (
                    <input
                        type={type}
                        value={obj[field] || ''}
                        onChange={e => updateEntity(obj, idx, field, e.target.value, setFn, list)}
                        className={`text-sm py-1 border-b bg-transparent outline-none transition-colors w-full
                            ${predicted ? 'border-amber-300 bg-amber-50 rounded-sm px-1 text-amber-900 placeholder:text-amber-300 focus:border-amber-600' : 'border-zinc-200 focus:border-zinc-800'}
                            ${hasError ? 'border-red-500 bg-red-50' : ''}`}
                        placeholder={`Enter ${label.toLowerCase()}...`}
                    />
                )}
                
                {hasConflict && (
                    <div className="mt-1.5 flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded p-1.5 px-2">
                        <div className="flex items-center text-[10px] text-zinc-500 truncate mr-2">
                            <span className="font-semibold text-zinc-700 mr-1 shrink-0">DB Value:</span>
                            <span className="truncate" title={stringifyExistingVal}>{stringifyExistingVal}</span>
                        </div>
                        <button 
                            onClick={revertToDb} 
                            title="Revert to existing Database value"
                            className="shrink-0 flex items-center text-[10px] font-bold uppercase text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-800 px-2 py-1 rounded transition-colors"
                        >
                            <RotateCcw className="w-3 h-3 mr-1" />
                            Revert
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8 mt-16 pb-32">
            <div className="mb-8 border-b border-zinc-200 pb-4">
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Data Ingestion</h1>
                <p className="mt-2 text-sm text-zinc-500">
                    Upload formatted offline documents (PDF, DOCX, CSV, Excel). The AI will process
                    and match existing elements in the system.
                </p>
            </div>

            {errorMsg && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
                    <p className="text-sm text-red-800">{errorMsg}</p>
                </div>
            )}

            {status === 'success' && (
                <div className="mb-6 bg-green-50 border border-green-200 p-6 rounded-lg text-center">
                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                    <h2 className="text-lg font-medium text-green-900">Save Successful</h2>
                    <p className="text-green-700 text-sm mt-1 mb-4">The injected data has been successfully mapped and committed into the database.</p>
                    <button onClick={() => { setStatus('idle'); setCompanies([]); setPeople([]); setMeetings([]); }}
                        className="bg-white text-green-700 px-4 py-2 text-sm font-medium border border-green-300 rounded hover:bg-green-100 transition-colors">
                        Upload Another Document
                    </button>
                </div>
            )}

            {status === 'idle' && (
                <div 
                    onClick={() => fileInput.current?.click()}
                    className="border-2 border-dashed border-zinc-300 rounded-xl p-16 text-center cursor-pointer hover:bg-zinc-50 hover:border-zinc-400 transition-all group"
                >
                    <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-4 group-hover:text-zinc-600 group-hover:scale-110 transition-all" />
                    <h3 className="text-base font-semibold text-zinc-900">Click to upload document</h3>
                    <p className="text-sm text-zinc-500 mt-1">PDF, DOCX, CSV, XLSX, TXT supported</p>
                    <input type="file" ref={fileInput} className="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt" onChange={handleFileUpload} />
                </div>
            )}

            {status === 'uploading' && (
                <div className="border border-zinc-200 rounded-xl p-16 text-center shadow-inner bg-zinc-50">
                    <div className="animate-spin w-8 h-8 rounded-full border-b-2 border-zinc-900 mx-auto mb-4"></div>
                    <p className="text-zinc-600 text-sm font-medium animate-pulse">Running document through AI Extraction Matrix...</p>
                </div>
            )}

            {(status === 'reviewing' || status === 'saving') && (
                <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
                    
                    <div className="border-b border-zinc-200 flex justify-between items-center bg-zinc-50 px-4">
                        <div className="flex">
                            <button onClick={() => setActiveTab('companies')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'companies' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>
                                Companies ({companies.length})
                            </button>
                            <button onClick={() => setActiveTab('people')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'people' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>
                                People ({people.length})
                            </button>
                            <button onClick={() => setActiveTab('meetings')} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'meetings' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>
                                Meetings ({meetings.length})
                            </button>
                        </div>
                        <button 
                            onClick={handleSave} 
                            disabled={status === 'saving'}
                            className="bg-zinc-900 text-white hover:bg-zinc-800 px-4 py-2 text-sm font-medium flex items-center rounded disabled:opacity-50 transition-colors"
                        >
                            {status === 'saving' ? <div className="w-4 h-4 border-b-2 border-white rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            {status === 'saving' ? 'Committing...' : 'Commit Save'}
                        </button>
                    </div>

                    <div className="p-6 bg-white min-h-[400px]">
                        
                        {activeTab === 'companies' && (
                            <div className="space-y-6">
                                {companies.map((co, idx) => (
                                    <div key={idx} className={`border rounded-lg p-5 relative overflow-hidden transition-all ${co.existingRecord ? 'border-blue-200 bg-blue-50/30' : 'border-zinc-200'}`}>
                                        <div className="absolute top-0 right-0 flex items-start">
                                            {co.existingRecord && (
                                                <div className="bg-blue-100 text-blue-800 text-[10px] uppercase font-bold px-3 py-1.5 rounded-bl-lg">
                                                    Update / Merge
                                                </div>
                                            )}
                                            <button 
                                                onClick={() => removeEntity(idx, 'companies')} 
                                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1 rounded-bl-lg border-l border-b border-transparent hover:border-red-100" 
                                                title="Delete record"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FieldEditor obj={co} idx={idx} field="name" label="Company Name" required setFn={setCompanies} list={companies} />
                                            <FieldEditor obj={co} idx={idx} field="pipelineValue" type="number" label="Pipeline Value" setFn={setCompanies} list={companies} />
                                        </div>
                                        <FieldEditor obj={co} idx={idx} field="description" label="Description" setFn={setCompanies} list={companies} />
                                    </div>
                                ))}
                                {companies.length === 0 && <p className="text-zinc-400 text-center py-10">No companies extracted</p>}
                            </div>
                        )}

                        {activeTab === 'people' && (
                            <div className="space-y-6">
                                {people.map((p, idx) => (
                                    <div key={idx} className={`border rounded-lg p-5 relative overflow-hidden transition-all ${p.existingRecord ? 'border-blue-200 bg-blue-50/30' : 'border-zinc-200'}`}>
                                        <div className="absolute top-0 right-0 flex items-start">
                                            {p.existingRecord && (
                                                <div className="bg-blue-100 text-blue-800 text-[10px] uppercase font-bold px-3 py-1.5 rounded-bl-lg">
                                                    Update / Merge
                                                </div>
                                            )}
                                            <button 
                                                onClick={() => removeEntity(idx, 'people')} 
                                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1 rounded-bl-lg border-l border-b border-transparent hover:border-red-100" 
                                                title="Delete record"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <FieldEditor obj={p} idx={idx} field="name" label="Full Name" required setFn={setPeople} list={people} />
                                            <FieldEditor obj={p} idx={idx} field="email" type="email" label="Email" required setFn={setPeople} list={people} />
                                            <FieldEditor obj={p} idx={idx} field="companyName" label="Company Reference" required setFn={setPeople} list={people} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                                            <FieldEditor obj={p} idx={idx} field="title" label="Job Title" required setFn={setPeople} list={people} />
                                            <FieldEditor obj={p} idx={idx} field="seniorityLevel" label="Seniority Level" setFn={setPeople} list={people} />
                                            <FieldEditor obj={p} idx={idx} field="type" label="Contact Type" setFn={setPeople} list={people} />
                                            <FieldEditor obj={p} idx={idx} field="isExternal" type="boolean" label="Is External?" setFn={setPeople} list={people} />
                                        </div>
                                        <div className="mt-2">
                                            <FieldEditor obj={p} idx={idx} field="linkedin" label="LinkedIn URL" setFn={setPeople} list={people} />
                                        </div>
                                    </div>
                                ))}
                                {people.length === 0 && <p className="text-zinc-400 text-center py-10">No people extracted</p>}
                            </div>
                        )}

                        {activeTab === 'meetings' && (
                            <div className="space-y-6">
                                {meetings.map((m, idx) => (
                                    <div key={idx} className={`border rounded-lg p-5 relative overflow-hidden transition-all ${m.existingRecord ? 'border-blue-200 bg-blue-50/30' : 'border-zinc-200'}`}>
                                        <div className="absolute top-0 right-0 flex items-start">
                                            {m.existingRecord && (
                                                <div className="bg-blue-100 text-blue-800 text-[10px] uppercase font-bold px-3 py-1.5 rounded-bl-lg">
                                                    Update / Merge
                                                </div>
                                            )}
                                            <button 
                                                onClick={() => removeEntity(idx, 'meetings')} 
                                                className="p-1.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-1 rounded-bl-lg border-l border-b border-transparent hover:border-red-100" 
                                                title="Delete record"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4">
                                            <FieldEditor obj={m} idx={idx} field="title" label="Meeting Title" required setFn={setMeetings} list={meetings} />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                                            <FieldEditor obj={m} idx={idx} field="date" label="Date (YYYY-MM-DD)" setFn={setMeetings} list={meetings} />
                                            <FieldEditor obj={m} idx={idx} field="startTime" label="Start Time" setFn={setMeetings} list={meetings} />
                                            <FieldEditor obj={m} idx={idx} field="endTime" label="End Time" setFn={setMeetings} list={meetings} />
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 mt-2">
                                            <FieldEditor obj={m} idx={idx} field="purpose" label="Purpose" setFn={setMeetings} list={meetings} />
                                        </div>
                                        <div className="mt-4 p-3 bg-zinc-50 border border-zinc-100 rounded text-sm text-zinc-600">
                                            <strong className="block text-xs uppercase tracking-wider text-zinc-400 mb-1">Inferred Attendees By AI:</strong>
                                            {m.attendeeEmails && m.attendeeEmails.length > 0 ? (
                                                 m.attendeeEmails.join(', ')
                                            ) : (
                                                <span className="italic">No attendees resolved</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {meetings.length === 0 && <p className="text-zinc-400 text-center py-10">No meetings extracted</p>}
                            </div>
                        )}
                        
                    </div>
                </div>
            )}
            
        </div>
    );
}

