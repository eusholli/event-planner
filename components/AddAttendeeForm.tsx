'use client'

import { useState, useEffect } from 'react'

interface Attendee {
    id: string
    name: string
    title: string
    email: string
    company: string
    bio: string
    companyDescription?: string
    linkedin?: string
    imageUrl?: string
    type?: string
}

interface AddAttendeeFormProps {
    onSuccess?: (attendee: Attendee) => void
    eventId: string
}

export default function AddAttendeeForm({ onSuccess, eventId }: AddAttendeeFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        title: '',
        email: '',
        company: '',
        bio: '',
        companyDescription: '',
        linkedin: '',
        imageUrl: '',
        isExternal: false,
        type: ''
    })
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [autoCompleting, setAutoCompleting] = useState(false)
    const [hasApiKey, setHasApiKey] = useState(false)
    const [attendeeTypes, setAttendeeTypes] = useState<string[]>([])
    const [suggestions, setSuggestions] = useState<Partial<Attendee> | null>(null)

    const resizeImage = (file: File): Promise<File> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(newFile);
                        } else {
                            reject(new Error('Canvas is empty'));
                        }
                    }, 'image/jpeg', 0.8);
                };
                img.onerror = (error) => reject(error);
            };
            reader.onerror = (error) => reject(error);
        });
    }

    useEffect(() => {
        checkSettings()
    }, [])

    const [searchResults, setSearchResults] = useState<Attendee[]>([])
    const [showResults, setShowResults] = useState(false)
    const [isLinking, setIsLinking] = useState(false)
    const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)

    const checkSettings = async () => {
        try {
            // Fetch global settings ONLY for API Key
            const settingsRes = await fetch('/api/settings')
            const settingsData = await settingsRes.json()
            setHasApiKey(!!settingsData.geminiApiKey)

            let types: string[] = []

            // Fetch event settings for Attendee Types
            if (eventId) {
                try {
                    const eventRes = await fetch(`/api/events/${eventId}`)
                    if (eventRes.ok) {
                        const eventData = await eventRes.json()
                        if (eventData.attendeeTypes && Array.isArray(eventData.attendeeTypes)) {
                            types = eventData.attendeeTypes
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch event details", e)
                }
            }

            setAttendeeTypes(types)
        } catch (error) {
            console.error('Error checking settings:', error)
        }
    }

    const performSearch = async (query: string) => {
        if (!query || query.length < 2) {
            setSearchResults([])
            setShowResults(false)
            return
        }

        try {
            const res = await fetch(`/api/attendees?query=${encodeURIComponent(query)}`)
            if (res.ok) {
                const data = await res.json()
                setSearchResults(data)
                setShowResults(true)
            }
        } catch (err) {
            console.error('Search failed', err)
        }
    }

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setFormData({ ...formData, name: val })

        // Clear linking state if user modifies name manually (assuming they might want a new person)
        if (isLinking && val !== formData.name) {
            setIsLinking(false)
            // Optional: Clear other fields if they were auto-filled? 
            // For better UX, let's keep them but unlock them.
        }

        if (searchTimeout) clearTimeout(searchTimeout)

        const timeout = setTimeout(() => {
            performSearch(val)
        }, 300)
        setSearchTimeout(timeout)
    }

    const selectExisting = (attendee: Attendee) => {
        setFormData({
            name: attendee.name,
            title: attendee.title,
            email: attendee.email,
            company: attendee.company,
            bio: attendee.bio || '',
            companyDescription: attendee.companyDescription || '',
            linkedin: attendee.linkedin || '',
            imageUrl: attendee.imageUrl || '',
            isExternal: false, // Default to internal/linked for existing? Or preserve? We don't have isExternal in search result type explicitly but interface has it.
            type: attendee.type || ''
        })
        setIsLinking(true)
        setShowResults(false)
        setSearchResults([])
        if (searchTimeout) clearTimeout(searchTimeout)
    }

    const handleAutoComplete = async () => {
        if (!formData.name || !formData.company) return
        setAutoCompleting(true)
        try {
            const res = await fetch('/api/attendees/autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    company: formData.company
                }),
            })

            if (res.ok) {
                const data = await res.json()
                setSuggestions(data)
            } else {
                alert('Failed to generate suggestions. Please check your API key.')
            }
        } catch (error) {
            console.error('Error auto completing:', error)
            alert('An error occurred while generating suggestions')
        } finally {
            setAutoCompleting(false)
        }
    }

    const applySuggestions = () => {
        if (!suggestions) return
        setFormData(prev => ({
            ...prev,
            title: suggestions.title || prev.title,
            bio: suggestions.bio || prev.bio,
            companyDescription: suggestions.companyDescription || prev.companyDescription,
            linkedin: suggestions.linkedin || prev.linkedin
        }))
        setSuggestions(null)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        try {
            const formDataToSend = new FormData()
            formDataToSend.append('name', formData.name)
            formDataToSend.append('title', formData.title)
            formDataToSend.append('email', formData.email)
            formDataToSend.append('company', formData.company)
            formDataToSend.append('bio', formData.bio)
            formDataToSend.append('companyDescription', formData.companyDescription)
            formDataToSend.append('linkedin', formData.linkedin)
            formDataToSend.append('imageUrl', formData.imageUrl)
            formDataToSend.append('isExternal', String(formData.isExternal))
            formDataToSend.append('type', formData.type)
            formDataToSend.append('eventId', eventId)

            if (selectedFile) {
                formDataToSend.append('imageFile', selectedFile)
            }

            const res = await fetch('/api/attendees', {
                method: 'POST',
                body: formDataToSend,
            })
            const data = await res.json()
            if (res.ok) {
                setFormData({ name: '', title: '', email: '', company: '', bio: '', companyDescription: '', linkedin: '', imageUrl: '', isExternal: false, type: '' })
                setSelectedFile(null)
                setIsLinking(false)
                if (onSuccess) {
                    onSuccess(data)
                }
            } else {
                setError(data.error || 'Failed to add attendee')
            }
        } catch (error) {
            console.error('Error adding attendee:', error)
            setError('An unexpected error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <div className={`card sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto ${isLinking ? 'border-2 border-green-500' : ''}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold tracking-tight text-zinc-900">
                        {isLinking ? 'Link Existing Attendee' : 'Add Attendee'}
                    </h2>
                    {isLinking && (
                        <button
                            type="button"
                            onClick={() => { setIsLinking(false); setFormData({ ...formData, name: '' }); }}
                            className="text-xs text-red-600 hover:underline"
                        >
                            Cancel Link
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Photo Input */}
                    <div className="flex flex-col items-center mb-6 space-y-3">
                        <div
                            className={`relative group ${isLinking ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                            onClick={() => !isLinking && document.getElementById('add-photo-upload')?.click()}
                        >
                            <div className={`w-24 h-24 rounded-full flex items-center justify-center overflow-hidden border-2 ${formData.imageUrl ? 'border-indigo-500' : 'border-zinc-200 bg-zinc-50'}`}>
                                {formData.imageUrl ? (
                                    <img src={formData.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <svg className="w-10 h-10 text-zinc-300" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                                    </svg>
                                )}
                            </div>
                            {!isLinking && (
                                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                </div>
                            )}
                        </div>
                        {!isLinking && (
                            <>
                                <input
                                    type="file"
                                    id="add-photo-upload"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={async (e) => {
                                        if (e.target.files?.[0]) {
                                            try {
                                                const resizedFile = await resizeImage(e.target.files[0])
                                                setSelectedFile(resizedFile)
                                                setFormData({ ...formData, imageUrl: URL.createObjectURL(resizedFile) })
                                            } catch (err) {
                                                console.error("Error resizing image:", err)
                                            }
                                        }
                                    }}
                                />
                                <div className="text-center w-full max-w-xs">
                                    <div className="text-xs text-zinc-500 mb-1">or enter URL</div>
                                    <input
                                        type="url"
                                        placeholder="https://example.com/photo.jpg"
                                        className="input-field text-xs py-1.5"
                                        value={selectedFile ? '' : formData.imageUrl}
                                        onChange={(e) => {
                                            setFormData({ ...formData, imageUrl: e.target.value })
                                            setSelectedFile(null)
                                        }}
                                    />
                                    {selectedFile && <div className="text-[10px] text-green-600 mt-1">Image selected</div>}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="relative">
                        <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-1.5">Name</label>
                        <input
                            type="text"
                            id="name"
                            required
                            className={`input-field ${isLinking ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            value={formData.name}
                            onChange={handleNameChange}
                            onFocus={() => {
                                if (searchResults.length > 0 && !isLinking) setShowResults(true)
                            }}
                            onBlur={() => {
                                // Delay hide to allow click
                                setTimeout(() => setShowResults(false), 200)
                            }}
                            readOnly={isLinking}
                        />
                        {/* Search Results Dropdown */}
                        {showResults && searchResults.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white shadow-lg rounded-md border border-zinc-200 max-h-60 overflow-y-auto">
                                {searchResults.map((result) => (
                                    <div
                                        key={result.id}
                                        className="px-4 py-2 hover:bg-indigo-50 cursor-pointer border-b border-zinc-50 last:border-none"
                                        onClick={() => selectExisting(result)}
                                    >
                                        <div className="font-medium text-zinc-900">{result.name}</div>
                                        <div className="text-xs text-zinc-500">{result.company} • {result.email}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label htmlFor="title" className="block text-sm font-medium text-zinc-700 mb-1.5">Title</label>
                        <input
                            type="text"
                            id="title"
                            required
                            className={`input-field ${isLinking ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            value={formData.title}
                            readOnly={isLinking}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="company" className="block text-sm font-medium text-zinc-700 mb-1.5">Company</label>
                        <input
                            type="text"
                            id="company"
                            required
                            className={`input-field ${isLinking ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            value={formData.company}
                            readOnly={isLinking}
                            onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
                        <input
                            type="email"
                            id="email"
                            required
                            className={`input-field ${isLinking ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            value={formData.email}
                            readOnly={isLinking}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>
                    {!isLinking && (
                        <div>
                            <label htmlFor="linkedin" className="block text-sm font-medium text-zinc-700 mb-1.5">LinkedIn URL</label>
                            <input
                                type="url"
                                id="linkedin"
                                className="input-field"
                                value={formData.linkedin}
                                onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                                placeholder="https://linkedin.com/in/..."
                            />
                        </div>
                    )}
                    {!isLinking && (
                        <div>
                            <label htmlFor="bio" className="block text-sm font-medium text-zinc-700 mb-1.5">Bio</label>
                            <textarea
                                id="bio"
                                className="input-field h-24 resize-none"
                                value={formData.bio}
                                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                            />
                        </div>
                    )}

                    {!isLinking && (
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="isExternal"
                                className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                checked={formData.isExternal}
                                onChange={(e) => setFormData({ ...formData, isExternal: e.target.checked })}
                            />
                            <label htmlFor="isExternal" className="text-sm font-medium text-zinc-700">
                                External Attendee
                            </label>
                        </div>
                    )}

                    {attendeeTypes.length > 0 && (
                        <div>
                            <label htmlFor="type" className="block text-sm font-medium text-zinc-700 mb-1.5">Attendee Type</label>
                            <select
                                id="type"
                                className={`input-field ${isLinking ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                value={formData.type}
                                disabled={isLinking}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                            >
                                <option value="">Select a type...</option>
                                {attendeeTypes.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="flex gap-3">
                        {!isLinking && (
                            <div className="relative flex-grow group">
                                <button
                                    type="button"
                                    onClick={handleAutoComplete}
                                    disabled={loading || !hasApiKey || !formData.name || !formData.company}
                                    className="w-full btn-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {autoCompleting ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>Thinking...</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                            <span>Auto Complete</span>
                                        </>
                                    )}
                                </button>
                                {!hasApiKey && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1 bg-zinc-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        Gemini API Key required in Settings
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-800"></div>
                                    </div>
                                )}
                            </div>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed px-6 w-full"
                        >
                            {loading ? (isLinking ? 'Linking...' : 'Adding...') : (isLinking ? 'Link Attendee' : 'Add')}
                        </button>
                    </div>
                </form>
            </div>

            {/* Suggestions Modal */}

            {suggestions && (
                <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
                        <h2 className="text-xl font-bold tracking-tight text-zinc-900 mb-4">Suggestions Found</h2>
                        <div className="space-y-4 mb-6">
                            <div>
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Title</span>
                                <p className="text-zinc-900">{suggestions.title}</p>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Bio</span>
                                <p className="text-zinc-600 text-sm">{suggestions.bio}</p>
                            </div>
                            <div>
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Company Description</span>
                                <p className="text-zinc-600 text-sm">{suggestions.companyDescription}</p>
                            </div>
                            {suggestions.linkedin && (
                                <div>
                                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">LinkedIn</span>
                                    <p className="text-indigo-600 text-sm truncate">{suggestions.linkedin}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setSuggestions(null)}
                                className="flex-1 btn-secondary"
                            >
                                Discard
                            </button>
                            <button
                                onClick={applySuggestions}
                                className="flex-1 btn-primary"
                            >
                                Accept & Fill
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
