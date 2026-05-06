import { useState, useEffect, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, getDocs } from 'firebase/firestore';

interface User {
  role: 'admin' | 'mechanic';
  name: string;
}

interface Schedule {
  id: string;
  mechanic: string;
  machine: string;
  task: string;
  status: string;
  date: string;
}

interface Machine {
  kode: string;
  nama: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [activeTab, setActiveTab] = useState('beranda');
  
  // State Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showMachineModal, setShowMachineModal] = useState(false);
  
  // State Edit
  const [editingMechanicFor, setEditingMechanicFor] = useState<Schedule | null>(null);
  const [editingTaskFor, setEditingTaskFor] = useState<Schedule | null>(null);
  
  // State Global
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterView, setFilterView] = useState<string | null>(null);
  
  // State List Mesin
  const [machineList, setMachineList] = useState<Machine[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen to Firestore real-time
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setErrorMsg(null);
    const unsub = onSnapshot(collection(db, 'Users'), (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Schedule))
        .filter(d => (d.machine && d.machine.trim() !== '') || 
                     (d.task && d.task.trim() !== '') || 
                     (d.mechanic && d.mechanic.trim() !== ''));
      setSchedules(data);
      setIsLoading(false);
    }, (error) => {
      setErrorMsg(`Gagal mengambil jadwal: ${error.message}. Pastikan Firestore Rules mengizinkan "read" dan nama collection adalah "Users".`);
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const fetchMachineData = async () => {
    setIsLoadingMachines(true);
    setShowMachineModal(true); 
    try {
      const querySnapshot = await getDocs(collection(db, 'machines'));
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs.map(d => d.data() as Machine);
        setMachineList(data);
      } else {
        // Fallback: Ambil data mesin langsung dari collection Users
        const usersSnapshot = await getDocs(collection(db, 'Users'));
        const uniqueMachines = new Map<string, Machine>();
        
        // Hanya ambil data yang benar-benar memiliki KODE MESIN dan MESIN dari master
        usersSnapshot.docs.forEach(doc => {
            const extraData = doc.data() as any;
            if (extraData['KODE MESIN'] && extraData['MESIN']) {
                const kode = extraData['KODE MESIN'].toString().trim();
                const nama = extraData['MESIN'].toString().trim();
                if (kode && kode !== '-') {
                    uniqueMachines.set(kode, { kode, nama });
                }
            }
        });
        
        setMachineList(Array.from(uniqueMachines.values()));
      }
    } catch (e: any) {
      console.error(e);
      setMachineList([
        { kode: 'ERROR', nama: `Gagal mengambil data mesin: ${e.message}.` },
      ]);
    } finally {
      setIsLoadingMachines(false);
    }
  };

  useEffect(() => { 
    setSearchQuery(''); 
    setFilterView(null);
  }, [activeTab]);

  const addSchedule = async (payload: Omit<Schedule, 'id' | 'status'>) => {
    const newId = Date.now().toString();
    const newSchedule = {...payload, id: newId, status: 'pending'};
    setShowAddModal(false);
    try {
      await setDoc(doc(db, 'Users', newId), newSchedule);
    } catch(e) {
      handleFirestoreError(e, OperationType.CREATE, 'Users');
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'Users', id), { status: newStatus });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `Users/${id}`);
    }
  };

  const updateMechanic = async (id: string, newMechanic: string) => {
    setEditingMechanicFor(null);
    try {
      await updateDoc(doc(db, 'Users', id), { mechanic: newMechanic.trim() });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `Users/${id}`);
    }
  };

  const updateTask = async (id: string, newTask: string) => {
    setEditingTaskFor(null);
    try {
      await updateDoc(doc(db, 'Users', id), { task: newTask.trim() });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `Users/${id}`);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const matchesSearch = (item: Schedule) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (item.machine || '').toLowerCase().includes(q) || 
           (item.mechanic || '').toLowerCase().includes(q) || 
           (item.task || '').toLowerCase().includes(q);
  };

  const sortedSchedules = [...schedules].sort((a,b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateA - dateB;
  });
  const historyList = sortedSchedules.filter(s => s.status === 'completed').reverse();

  const todaysTasksOnly = sortedSchedules.filter(s => s.date === todayStr && s.status !== 'completed');
  const todayCount = todaysTasksOnly.length;
  const incompleteCount = sortedSchedules.filter(s => s.status === 'incomplete').length;
  const progressCount = sortedSchedules.filter(s => s.status === 'in_progress').length;
  const rescheduleCount = sortedSchedules.filter(s => s.status === 're_schedule').length;

  let baseBerandaList = sortedSchedules.filter(s => s.status !== 'completed' && (s.date || '') <= todayStr);
  baseBerandaList = baseBerandaList.filter(matchesSearch);
  const finalBerandaList = baseBerandaList;

  const jadwalList = sortedSchedules.filter(s => s.status !== 'completed').filter(matchesSearch);

  if (!user) return <LoginView onLogin={(role, name) => setUser({role, name})} />;

  return (
    <div className="h-[100dvh] w-full bg-[#f4f7fa] flex justify-center font-sans text-slate-800 selection:bg-blue-200 overflow-hidden relative">
        <div className="w-full max-w-md bg-[#f4f7fa] h-full relative shadow-2xl flex flex-col">
            
            <header className="flex justify-between items-center px-5 pt-6 pb-2 shrink-0">
                <button onClick={fetchMachineData} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-50 flex items-center justify-center text-slate-400 active:scale-90 transition">
                    <i className="fas fa-bars"></i>
                </button>
                <div className="text-center">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
                        {currentTime.toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'})}
                    </p>
                    <p className="text-sm font-black text-slate-400 tracking-wider">
                        {currentTime.toLocaleTimeString('id-ID').replace(/:/g, '.')}
                    </p>
                </div>
                <button onClick={() => setShowHistoryModal(true)} className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-50 flex items-center justify-center text-blue-600 active:scale-90 transition">
                    <i className="fas fa-history text-base"></i>
                </button>
            </header>

            <main className="flex-1 overflow-y-auto px-5 no-scrollbar pb-24">
                
                {activeTab === 'beranda' && (
                    <div className="animate-slide-up">
                        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] p-6 mb-6 mt-2 shadow-xl shadow-blue-500/20 text-white relative overflow-hidden">
                            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">Maintenance Pro</p>
                            <h2 className="text-3xl font-black mb-5 italic tracking-tighter">
                                Halo, {user.role === 'admin' ? 'Admin' : 'Mekanik'}!
                            </h2>
                            <div className="relative z-10">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-white/60"></i>
                                <input 
                                    type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Cari mesin, mekanik, tugas..." 
                                    className="w-full bg-white/10 text-white rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none shadow-inner font-bold border border-white/20 placeholder-white/50 focus:bg-white/20 transition" 
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-6">
                            <StatBox color="today" icon="fa-list-ul" val={todayCount} label="Pekerjaan Hari Ini" onClick={() => setFilterView('today')} />
                            <StatBox color="incomplete" icon="fa-clipboard-list" val={incompleteCount} label="Belum Selesai" onClick={() => setFilterView('incomplete')} />
                            <StatBox color="progress" icon="fa-bolt" val={progressCount} label="Progres" onClick={() => setFilterView('progress')} />
                            <StatBox color="reschedule" icon="fa-clock" val={rescheduleCount} label="Re Schedule" onClick={() => setFilterView('reschedule')} />
                        </div>

                        <div className="flex justify-between items-end mb-4 px-1">
                            <h3 className="font-black text-slate-800 text-lg uppercase italic tracking-tighter">Pekerjaan Hari Ini</h3>
                            <button disabled={isLoading} className="text-blue-600 font-bold text-[10px] uppercase flex items-center gap-1 active:scale-90 transition">
                                <i className={`fas fa-sync-alt ${isLoading ? 'animate-spin' : ''}`}></i> {isLoading ? 'Memuat...' : 'Live'}
                            </button>
                        </div>

                        {errorMsg && (
                            <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-4 border border-red-100 text-xs font-bold leading-relaxed shadow-sm">
                                <i className="fas fa-exclamation-triangle mr-2"></i> {errorMsg}
                            </div>
                        )}

                        <div className={`transition-opacity duration-300 ${isLoading ? 'opacity-40' : 'opacity-100'}`}>
                            {finalBerandaList.length > 0 ? finalBerandaList.map(s => (
                                <TaskCard 
                                    key={s.id} item={s} isAdmin={user.role==='admin'} onStatus={updateStatus} 
                                    onEditMech={() => setEditingMechanicFor(s)} onEditTask={() => setEditingTaskFor(s)}
                                />
                            )) : (
                                <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-50 shadow-sm">
                                    <i className="fas fa-folder-open text-4xl text-slate-200 mb-3"></i>
                                    <p className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">{searchQuery ? 'Pencarian Kosong' : 'Tidak ada jadwal aktif'}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'jadwal' && (
                    <div className="animate-slide-up mt-2">
                        <h2 className="text-2xl font-black text-slate-800 uppercase italic mb-4">Semua Jadwal</h2>
                        
                        <div className="relative mb-6">
                            <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                            <input 
                                type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Cari mesin, mekanik..." 
                                className="w-full bg-white text-slate-800 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none shadow-sm font-bold border border-slate-100 focus:border-blue-300" 
                            />
                        </div>

                        <div className="space-y-6">
                            {(() => {
                                const grouped = jadwalList.reduce((acc, curr) => {
                                    const d = curr.date;
                                    if(!acc[d]) acc[d] = [];
                                    acc[d].push(curr);
                                    return acc;
                                }, {} as Record<string, Schedule[]>);

                                const dates = Object.keys(grouped).sort();
                                if(dates.length === 0) return (
                                    <div className="text-center py-16 opacity-40">
                                        <i className="fas fa-folder-open text-5xl mb-3"></i>
                                        <p className="font-black tracking-widest uppercase text-xs">Kosong</p>
                                    </div>
                                );

                                return dates.map(date => {
                                    let dateLabel = date;
                                    const dObj = new Date(date);
                                    const today = new Date();
                                    const tomorrow = new Date(); tomorrow.setDate(today.getDate()+1);
                                    
                                    if (date === today.toISOString().split('T')[0]) dateLabel = "Jadwal Hari Ini";
                                    else if (date === tomorrow.toISOString().split('T')[0]) dateLabel = "Jadwal Besok";
                                    else dateLabel = dObj.toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

                                    return (
                                        <div key={date}>
                                            <h3 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-3 ml-2">{dateLabel}</h3>
                                            <div className="space-y-3">
                                                {grouped[date].map(s => (
                                                    <TaskCard 
                                                        key={s.id} item={s} isAdmin={user.role==='admin'} onStatus={updateStatus} 
                                                        onEditMech={() => setEditingMechanicFor(s)} onEditTask={() => setEditingTaskFor(s)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}
            </main>

            {user.role === 'admin' && (
                <button onClick={() => setShowAddModal(true)} className="absolute bottom-20 right-5 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg shadow-blue-500/40 flex items-center justify-center text-xl active:scale-90 transition-transform z-40 border-[3px] border-[#f4f7fa]">
                    <i className="fas fa-plus"></i>
                </button>
            )}

            <div className="absolute bottom-0 w-full bg-white flex justify-around py-3 px-2 rounded-t-2xl shadow-[0_-5px_20px_rgba(0,0,0,0.04)] z-30 border-t border-slate-50 shrink-0">
                <NavBtn active={activeTab==='beranda'} icon="fa-home" label="Beranda" onClick={()=>setActiveTab('beranda')} />
                <NavBtn active={activeTab==='jadwal'} icon="fa-calendar-alt" label="Jadwal" onClick={()=>setActiveTab('jadwal')} />
                <NavBtn active={false} icon="fa-cog" label="Settings" onClick={()=>{}} />
                <NavBtn active={false} icon="fa-power-off" label="Logout" onClick={()=>setUser(null)} />
            </div>

            {showAddModal && <AddModal onClose={()=>setShowAddModal(false)} onSave={addSchedule} />}
            {showHistoryModal && <HistoryView list={historyList} onClose={()=>setShowHistoryModal(false)} isAdmin={user.role==='admin'} onStatus={updateStatus} onEditMech={s => setEditingMechanicFor(s)} onEditTask={s => setEditingTaskFor(s)}/>}
            {editingMechanicFor && <EditMechModal mech={editingMechanicFor.mechanic} onClose={()=>setEditingMechanicFor(null)} onSave={val => updateMechanic(editingMechanicFor.id, val)} />}
            {editingTaskFor && <EditTaskModal task={editingTaskFor.task} onClose={()=>setEditingTaskFor(null)} onSave={val => updateTask(editingTaskFor.id, val)} />}
            {filterView && <FilterModalView type={filterView} list={sortedSchedules} todayStr={todayStr} onClose={()=>setFilterView(null)} isAdmin={user.role==='admin'} onStatus={updateStatus} onEditMech={s => setEditingMechanicFor(s)} onEditTask={s => setEditingTaskFor(s)} />}
            {showMachineModal && <MachineModal list={machineList} isLoading={isLoadingMachines} onClose={()=>setShowMachineModal(false)} />}
        </div>
    </div>
  );
}

// === Sub-Komponen ===

function MachineModal({list, isLoading, onClose}: {list: Machine[], isLoading: boolean, onClose: () => void}) {
    const [search, setSearch] = useState('');

    const filteredList = useMemo(() => {
        if (!search.trim()) return list;
        const q = search.toLowerCase();
        return list.filter(m => (m.nama || "").toLowerCase().includes(q) || (m.kode || "").toLowerCase().includes(q));
    }, [list, search]);

    return (
        <div className="absolute inset-0 bg-[#f4f7fa] z-[80] flex flex-col animate-slide-up no-scrollbar text-slate-800">
            <header className="p-5 pt-8 bg-white shadow-sm rounded-b-3xl border-b border-slate-50 z-10 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter"><i className="fas fa-cogs text-blue-600 mr-2"></i> DATA MESIN</h2>
                    <button onClick={onClose} className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 active:scale-90"><i className="fas fa-arrow-left text-sm"></i></button>
                </div>
                <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode atau nama mesin..." className="w-full bg-slate-50 border border-slate-100 text-slate-800 placeholder-slate-400 rounded-xl py-3 pl-10 pr-4 text-xs focus:outline-none focus:border-blue-300 font-bold" />
                    {search && <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><i className="fas fa-times"></i></button>}
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 no-scrollbar pb-10">
                {isLoading ? (
                    <div className="text-center py-20 text-slate-400 font-bold uppercase text-[10px] tracking-widest bg-white rounded-3xl border border-slate-100 shadow-sm"><i className="fas fa-circle-notch fa-spin text-3xl mb-3 text-blue-500 block"></i> Memuat Data...</div>
                ) : filteredList.length > 0 ? filteredList.map((m, i) => (
                    <div key={i} className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-50">
                        <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-black text-[11px] px-1 text-center break-words border border-blue-100/50 leading-tight">{m.kode}</div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-extrabold text-sm text-slate-800 leading-snug break-words">{m.nama}</h4>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">KODE: {m.kode}</p>
                        </div>
                    </div>
                )) : (
                    <div className="text-center py-20 text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] italic bg-white rounded-3xl border border-slate-100 shadow-sm"><i className="fas fa-box-open text-3xl mb-3 opacity-30 block"></i> Data Kosong</div>
                )}
            </div>
        </div>
    );
}

function FilterModalView({type, list, todayStr, onClose, isAdmin, onStatus, onEditMech, onEditTask}: any) {
    const [search, setSearch] = useState('');

    let filtered = list;
    let title = "";
    let icon = "";
    let textColor = "";

    if (type === 'today') {
        filtered = list.filter((s: any) => s.date === todayStr && s.status !== 'completed');
        title = "Tugas Hari Ini"; icon = "fa-list-ul"; textColor = "text-blue-600";
    } else if (type === 'incomplete') {
        filtered = list.filter((s: any) => s.status === 'incomplete');
        title = "Belum Selesai"; icon = "fa-clipboard-list"; textColor = "text-red-500";
    } else if (type === 'progress') {
        filtered = list.filter((s: any) => s.status === 'in_progress');
        title = "Progres"; icon = "fa-bolt"; textColor = "text-teal-500";
    } else if (type === 'reschedule') {
        filtered = list.filter((s: any) => s.status === 're_schedule');
        title = "Re Schedule"; icon = "fa-clock"; textColor = "text-orange-500";
    }

    if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((s: any) => (s.machine || '').toLowerCase().includes(q) || (s.mechanic || '').toLowerCase().includes(q) || (s.task || '').toLowerCase().includes(q));
    }

    return (
        <div className="absolute inset-0 bg-[#f4f7fa] z-[80] flex flex-col animate-slide-up">
            <header className="px-5 py-4 bg-white shadow-sm rounded-b-3xl pt-6 z-10 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase italic"><i className={`fas ${icon} ${textColor} mr-2`}></i> {title}</h2>
                    <button onClick={onClose} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-400 flex items-center justify-center active:scale-90 border border-slate-100"><i className="fas fa-arrow-left text-sm"></i></button>
                </div>
                <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Cari di ${title}...`} className="w-full bg-slate-50 text-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold focus:outline-none border border-slate-100 focus:border-blue-300 transition" />
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5 no-scrollbar pb-10">
                {filtered.length > 0 ? filtered.map((s: any) => (
                    <TaskCard key={s.id} item={s} isAdmin={isAdmin} onStatus={onStatus} onEditMech={()=>onEditMech(s)} onEditTask={()=>onEditTask(s)} />
                )) : (
                    <div className="text-center py-20 opacity-40">
                        <i className="fas fa-folder-open text-5xl mb-3 text-slate-300"></i>
                        <p className="font-black text-slate-400 tracking-widest uppercase text-[10px]">Kosong</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatBox({color, icon, val, label, onClick, isActive = true}: any) {
    const gradients: any = {
        today: 'from-[#4FACFE] to-[#1E3CFF] shadow-blue-500/30',
        incomplete: 'from-[#FF6A6A] to-[#FF2D55] shadow-red-500/30',
        progress: 'from-[#34D399] to-[#0EA5A4] shadow-teal-500/30',
        reschedule: 'from-[#FFD54F] to-[#FF9800] shadow-orange-500/30'
    };
    const grad = gradients[color] || gradients.today;

    return (
        <div onClick={onClick} className={`p-4 rounded-[1.5rem] bg-gradient-to-br ${grad} text-white shadow-xl flex flex-col justify-between aspect-[4/3] relative overflow-hidden transition-all duration-300 cursor-pointer active:scale-95 ${isActive ? 'opacity-100 scale-100' : 'opacity-40 scale-95'}`}>
            <i className={`fas ${icon} absolute -right-3 -bottom-3 text-[4rem] opacity-20 transform -rotate-12`}></i>
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner mb-2 z-10">
                <i className={`fas ${icon} text-sm drop-shadow-sm`}></i>
            </div>
            <div className="z-10">
                <h3 className="text-3xl font-black mb-0 drop-shadow-md tracking-tighter">{val}</h3>
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-90 drop-shadow-sm">{label}</p>
            </div>
        </div>
    );
}

function NavBtn({active, icon, label, onClick}: any) {
    return (
        <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 flex-1 transition-all ${active?'text-blue-600':'text-slate-300 hover:text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center transition-all ${active?'bg-blue-50 text-blue-600':'text-slate-400'}`}>
                <i className={`fas ${icon} text-base`}></i>
            </div>
            <span className="text-[8px] font-black uppercase tracking-wider">{label}</span>
        </button>
    );
}

function TaskCard({item, isAdmin, onStatus, onEditMech, onEditTask}: any) {
    const [sendState, setSendState] = useState('idle');

    const sendWAAuto = async () => {
        const phones: any = { 
            "Selamet": "6289521719929", 
            "Said": "6281325171336", 
            "Fajar": "6285362713692", 
            "Krisnadi": "628562669274", 
            "Gozali": "6285640555696" 
        };
        const phone = phones[item.mechanic] || "";
        if (!phone) { setSendState('error'); setTimeout(() => setSendState('idle'), 3000); return; }

        const pesan = `Halo ${item.mechanic},\nMohon segera tindak lanjuti pekerjaan yang tertunda.\n⚙️ Mesin: ${item.machine}\n📝 Tugas: ${item.task}\n📅 Tgl: ${item.date}\nStatus saat ini masih Belum Selesai. Mohon segera diselesaikan. Terima kasih`;

        setSendState('sending');
        
        try {
            // Forward request to our backend proxy to avoid CORS
            const res = await fetch('/api/wa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target: phone, message: pesan })
            });
            const data = await res.json();
            setSendState(data.success ? 'success' : 'error');
            setTimeout(() => setSendState('idle'), 3000);
        } catch(e) {
            setSendState('error');
            setTimeout(() => setSendState('idle'), 3000);
        }
    };

    const configs: any = {
        pending: { label: 'DIJADWALKAN', bg: 'bg-white', icon: 'fa-calendar-alt', iconColor: 'text-slate-400' },
        in_progress: { label: 'PROGRES', bg: 'bg-white', icon: 'fa-spinner', iconColor: 'text-blue-500' },
        incomplete: { label: 'BELUM SELESAI', bg: 'bg-white', icon: 'fa-exclamation-triangle', iconColor: 'text-red-500' },
        re_schedule: { label: 'RE SCHEDULE', bg: 'bg-white', icon: 'fa-calendar-plus', iconColor: 'text-orange-500' },
        completed: { label: 'SELESAI', bg: 'bg-[#40c9a2]', icon: 'fa-check', iconColor: 'text-white' }
    };
    const cfg = configs[item.status] || configs.pending;

    if (item.status === 'completed') {
        return (
            <div className="relative overflow-hidden rounded-3xl p-5 shadow-sm bg-[#40c9a2] text-white mb-3">
                <div className="absolute top-4 right-4 flex gap-1 opacity-20">
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                </div>
                <div className="flex items-start gap-3 relative z-10">
                    <div className="w-12 h-12 bg-white shadow-sm rounded-2xl flex items-center justify-center shrink-0">
                        <i className={`fas fa-check text-xl text-[#40c9a2]`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                            <h4 className="font-extrabold text-base leading-tight text-white drop-shadow-sm break-words pr-2 line-through opacity-90">{item.machine}</h4>
                            {isAdmin ? (
                                <div className="relative shrink-0 text-slate-800">
                                    <select value={item.status} onChange={e=>onStatus(item.id, e.target.value)} className="appearance-none text-[8px] font-black py-1.5 pl-2 pr-5 rounded-lg text-slate-700 bg-white border-0 outline-none shadow-sm cursor-pointer uppercase">
                                        <option value="completed">SELESAI</option>
                                        <option value="pending">DIJADWALKAN</option>
                                    </select>
                                    <i className="fas fa-chevron-down absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none"></i>
                                </div>
                            ) : (
                                <span className="text-[8px] font-black py-1.5 px-2 rounded-lg bg-white text-slate-700 shadow-sm shrink-0 uppercase">{cfg.label}</span>
                            )}
                        </div>
                        <p className="text-[10px] text-white/80 font-semibold italic leading-snug line-clamp-1 mb-2 drop-shadow-sm">{item.task}</p>
                        <div className="flex flex-wrap gap-2 text-slate-800">
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg text-blue-700 text-[9px] font-extrabold shadow-sm"><i className="fas fa-user-circle opacity-70"></i> {(item.mechanic || '').toUpperCase()}</span>
                            <span className="flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg text-blue-700 text-[9px] font-extrabold shadow-sm"><i className="fas fa-calendar-alt opacity-70"></i> {item.date}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative overflow-hidden rounded-3xl p-5 shadow-sm bg-white border border-slate-100 text-slate-800 mb-3`}>
            <div className="flex items-start gap-4">
                <div className={`w-14 h-14 ${item.status === 'in_progress' ? 'bg-blue-50' : 'bg-slate-50'} rounded-2xl flex items-center justify-center shrink-0`}>
                    <i className={`fas ${cfg.icon} text-2xl ${cfg.iconColor} ${item.status === 'in_progress' ? 'animate-spin' : ''}`}></i>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 gap-2">
                        <h4 className="font-extrabold text-base text-slate-800 leading-tight break-words pr-2">{item.machine}</h4>
                        {isAdmin ? (
                            <div className="relative shrink-0">
                                <select value={item.status} onChange={e=>onStatus(item.id, e.target.value)} className={`appearance-none text-[8px] font-black py-1.5 pl-2 pr-5 rounded-lg ${item.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : item.status === 'incomplete' ? 'bg-red-50 text-red-600' : item.status === 're_schedule' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'} border-0 outline-none shadow-sm cursor-pointer uppercase`}>
                                    <option value="pending">DIJADWALKAN</option>
                                    <option value="in_progress">PROGRES</option>
                                    <option value="incomplete">BELUM SELESAI</option>
                                    <option value="re_schedule">RE SCHEDULE</option>
                                    <option value="completed">SELESAI</option>
                                </select>
                                <i className="fas fa-chevron-down absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none"></i>
                            </div>
                        ) : (
                            <span className={`text-[8px] font-black py-1.5 px-2 rounded-lg shadow-sm shrink-0 uppercase ${item.status === 'in_progress' ? 'bg-blue-50 text-blue-700' : item.status === 'incomplete' ? 'bg-red-50 text-red-600' : item.status === 're_schedule' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'}`}>{cfg.label}</span>
                        )}
                    </div>

                    <div className="group flex items-start justify-between gap-2 mb-3">
                        <p className="text-xs text-slate-400 font-semibold italic leading-snug line-clamp-2">{item.task}</p>
                        <button onClick={onEditTask} className="shrink-0 w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center active:scale-90 transition-transform hover:bg-slate-100 border border-slate-100">
                            <i className="fas fa-pencil-alt text-[9px] text-slate-400"></i>
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-auto">
                        <button onClick={isAdmin ? onEditMech : undefined} disabled={!isAdmin} className={`flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-extrabold shadow-sm whitespace-nowrap w-max ${isAdmin ? 'active:scale-95 cursor-pointer' : 'cursor-default'}`}>
                            <i className="fas fa-user-circle opacity-70"></i> {(item.mechanic || '').toUpperCase()}
                        </button>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-extrabold shadow-sm whitespace-nowrap w-max border border-blue-100/50">
                            <i className="fas fa-calendar-alt opacity-70"></i> {item.date}
                        </div>
                        {isAdmin && (item.status === 'incomplete' || item.status === 're_schedule') && (
                            <button onClick={sendWAAuto} disabled={sendState==='sending'} className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-green-500 text-white rounded-lg text-[9px] font-black shadow-sm active:scale-95 transition-all">
                                <i className="fab fa-whatsapp text-sm"></i>
                                {sendState === 'idle' && 'WA'}
                                {sendState === 'sending' && '...'}
                                {sendState === 'success' && 'OK'}
                                {sendState === 'error' && 'X'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function HistoryView({list, onClose, isAdmin, onStatus, onEditMech, onEditTask}: any) {
    const [search, setSearch] = useState('');
    const filtered = list.filter((s: any) => {
        if(!search) return true;
        const q = search.toLowerCase();
        return (s.machine || '').toLowerCase().includes(q) || (s.mechanic || '').toLowerCase().includes(q) || (s.task || '').toLowerCase().includes(q);
    });

    return (
        <div className="absolute inset-0 bg-[#f4f7fa] z-[80] flex flex-col animate-slide-up">
            <header className="px-5 py-4 bg-white shadow-sm rounded-b-3xl pt-6 z-10 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase italic"><i className="fas fa-history text-blue-600 mr-2"></i> Riwayat</h2>
                    <button onClick={onClose} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-400 flex items-center justify-center active:scale-90 border border-slate-100"><i className="fas fa-times text-sm"></i></button>
                </div>
                <div className="relative">
                    <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
                    <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari di riwayat..." className="w-full bg-slate-50 text-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-bold focus:outline-none border border-slate-100 focus:border-blue-300 transition" />
                </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5 no-scrollbar pb-10">
                {filtered.length > 0 ? filtered.map((s: any) => (
                    <TaskCard key={s.id} item={s} isAdmin={isAdmin} onStatus={onStatus} onEditMech={()=>onEditMech(s)} onEditTask={()=>onEditTask(s)} />
                )) : (
                    <div className="text-center py-20 opacity-40">
                        <i className="fas fa-folder-open text-5xl mb-3 text-slate-300"></i>
                        <p className="font-black text-slate-400 tracking-widest uppercase text-[10px]">Kosong</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function LoginView({onLogin}: any) {
    const [view, setView] = useState('choice');
    const [pass, setPass] = useState('');

    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    const base64ToArrayBuffer = (base64: string) => {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    };

    const handleFingerprintLogin = async () => {
        if (!window.PublicKeyCredential) {
            alert("Browser/perangkat Anda tidak mendukung fitur sidik jari (WebAuthn).");
            return;
        }

        try {
            const storedCredId = localStorage.getItem('admin_passkey_id');

            if (storedCredId) {
                const credIdBuffer = base64ToArrayBuffer(storedCredId);
                const assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: new Uint8Array(32),
                        allowCredentials: [{
                            id: credIdBuffer,
                            type: 'public-key'
                        }],
                        userVerification: 'required',
                    }
                });
                if (assertion) {
                    onLogin('admin', 'Admin');
                }
            } else {
                if (confirm("Sidik jari belum didaftarkan pada perangkat ini. Ingin mendaftarkan sidik jari (Passkey) sekarang?")) {
                    const challenge = new Uint8Array(32);
                    window.crypto.getRandomValues(challenge);
                    const userId = new Uint8Array(16);
                    window.crypto.getRandomValues(userId);

                    const credential = await navigator.credentials.create({
                        publicKey: {
                            challenge: challenge,
                            rp: { name: "Schedule Maintenance" },
                            user: {
                                id: userId,
                                name: "admin",
                                displayName: "Administrator"
                            },
                            pubKeyCredParams: [
                                { type: "public-key", alg: -7 },
                                { type: "public-key", alg: -257 }
                            ],
                            authenticatorSelection: { 
                                authenticatorAttachment: "platform", 
                                userVerification: "required" 
                            },
                            timeout: 60000,
                        }
                    });
                    
                    if (credential) {
                        const credId = arrayBufferToBase64((credential as any).rawId);
                        localStorage.setItem('admin_passkey_id', credId);
                        onLogin('admin', 'Admin');
                    }
                }
            }
        } catch (err: any) {
            console.error(err);
            if (err.name !== 'NotAllowedError') {
                 alert('Gagal menggunakan sidik jari: ' + err.message);
            }
        }
    };

    return (
        <div className="min-h-screen bg-[#f4f7fa] flex items-center justify-center p-5">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl w-full max-w-sm text-center border border-slate-50">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6"><i className="fas fa-wrench text-blue-600 text-3xl"></i></div>
                <h1 className="text-3xl font-black text-slate-800 mb-1 tracking-tighter italic">MAINTENANCE</h1>
                <p className="text-slate-400 text-[10px] mb-10 font-bold uppercase tracking-widest">Sistem Monitoring Mesin</p>
                
                {view === 'choice' ? (
                    <div className="space-y-4">
                        <button onClick={()=>setView('admin')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all tracking-widest text-sm">LOGIN ADMIN</button>
                        <button onClick={()=>onLogin('mechanic', 'Mekanik')} className="w-full bg-white text-blue-600 border-2 border-blue-50 py-4 rounded-2xl font-black active:scale-95 transition-all tracking-widest text-sm">LOGIN MEKANIK</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <input type="password" placeholder="Password" className="w-full bg-slate-50 py-4 px-6 rounded-2xl outline-none font-bold text-center text-base focus:ring-2 focus:ring-blue-100 border border-slate-100 transition" value={pass} onChange={e=>setPass(e.target.value)} autoFocus />
                        <button onClick={() => pass==='admin123' ? onLogin('admin', 'Admin') : alert('Password Salah!')} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-200 uppercase tracking-widest active:scale-95 text-sm">Masuk dengan Password</button>
                        
                        <div className="flex items-center my-2 opacity-50">
                            <div className="flex-1 border-t border-slate-300"></div>
                            <span className="px-3 text-slate-400 text-[9px] font-black uppercase tracking-widest">Atau</span>
                            <div className="flex-1 border-t border-slate-300"></div>
                        </div>

                        <button onClick={handleFingerprintLogin} className="w-full bg-slate-800 text-white py-4 rounded-2xl font-black shadow-lg shadow-slate-200 uppercase tracking-widest active:scale-95 text-sm flex items-center justify-center gap-2">
                            <i className="fas fa-fingerprint text-lg"></i> Sidik Jari (Fingerprint)
                        </button>

                        <button onClick={()=>setView('choice')} className="text-slate-400 font-bold text-[10px] uppercase tracking-widest mt-4 p-2 active:scale-95 block w-full text-center">Kembali</button>
                    </div>
                )}
            </div>
        </div>
    );
}

function AddModal({onClose, onSave}: any) {
    const [form, setForm] = useState({mechanic: '', machine: '', task: '', date: new Date().toISOString().split('T')[0]});
    return (
        <div className="absolute inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-black text-slate-800 uppercase italic">Tambah Jadwal</h3>
                    <button onClick={onClose} className="w-8 h-8 bg-slate-50 rounded-xl text-slate-400 flex items-center justify-center active:scale-90 border border-slate-100"><i className="fas fa-times text-sm"></i></button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">Nama Mekanik</label>
                        <input list="mechs" placeholder="Ketik/Pilih mekanik..." className="w-full bg-slate-50 p-3 rounded-xl outline-none font-bold text-xs border border-slate-100 focus:border-blue-300 transition" onChange={e=>setForm({...form, mechanic: e.target.value})} />
                        <datalist id="mechs"><option value="Selamet"/><option value="Said"/><option value="Fajar"/><option value="Krisnadi"/><option value="Gozali"/></datalist>
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">Nama Mesin</label>
                        <input placeholder="Nama mesin..." className="w-full bg-slate-50 p-3 rounded-xl outline-none font-bold text-xs border border-slate-100 focus:border-blue-300 transition" onChange={e=>setForm({...form, machine: e.target.value})} />
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">Tugas</label>
                        <textarea placeholder="Deskripsi perbaikan..." rows={2} className="w-full bg-slate-50 p-3 rounded-xl outline-none font-bold text-xs border border-slate-100 focus:border-blue-300 resize-none transition" onChange={e=>setForm({...form, task: e.target.value})}></textarea>
                    </div>
                    <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">Tanggal</label>
                        <input type="date" className="w-full bg-slate-50 p-3 rounded-xl outline-none font-bold text-xs border border-slate-100 focus:border-blue-300 transition" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} />
                    </div>
                    <button onClick={()=>onSave(form)} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black shadow-lg shadow-blue-200 active:scale-95 transition-all mt-4 uppercase tracking-widest text-[10px]">Simpan Tugas</button>
                </div>
            </div>
        </div>
    );
}

function EditMechModal({mech, onClose, onSave}: any) {
    const [val, setVal] = useState(mech);
    return (
        <div className="absolute inset-0 bg-slate-900/60 z-[100] flex items-center justify-center p-5 backdrop-blur-sm">
            <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center shadow-2xl animate-slide-up">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg"><i className="fas fa-user-edit"></i></div>
                <h3 className="font-black text-base mb-4 uppercase text-slate-800 italic">Pindah Mekanik</h3>
                <input list="mechs-edit" value={val} onChange={e=>setVal(e.target.value)} className="w-full bg-slate-50 border border-slate-100 p-3 rounded-xl font-black text-center outline-none mb-6 text-xs focus:border-blue-300 transition" autoFocus />
                <datalist id="mechs-edit"><option value="Selamet"/><option value="Said"/><option value="Fajar"/><option value="Krisnadi"/><option value="Gozali"/></datalist>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-400 uppercase text-[9px] tracking-widest active:scale-95 transition">Batal</button>
                    <button onClick={()=>onSave(val)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase text-[9px] tracking-widest shadow-lg shadow-blue-200 active:scale-95 transition">Update</button>
                </div>
            </div>
        </div>
    );
}

function EditTaskModal({task, onClose, onSave}: any) {
    const [val, setVal] = useState(task || '');
    return (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-5">
            <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center animate-slide-up shadow-2xl">
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 text-lg"><i className="fas fa-clipboard-list"></i></div>
                <h3 className="font-black text-base mb-4 uppercase text-slate-800 italic">Edit Pekerjaan</h3>
                <textarea 
                    value={val} onChange={e=>setVal(e.target.value)} rows={3}
                    className="w-full border border-slate-200 bg-slate-50 p-3 rounded-xl font-semibold text-center outline-none mb-5 text-xs resize-none focus:border-indigo-400 focus:bg-white transition-colors" 
                    autoFocus placeholder="Deskripsi pekerjaan..."
                ></textarea>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-400 text-[9px] tracking-widest uppercase active:scale-95 transition">Batal</button>
                    <button onClick={()=>onSave(val)} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[9px] tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition">Simpan</button>
                </div>
            </div>
        </div>
    );
}
