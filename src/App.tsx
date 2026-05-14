import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft,
  Check,
  Copy,
  Play, 
  Download, 
  Search, 
  LogIn, 
  LogOut, 
  Lock,
  Film, 
  Tv, 
  Clapperboard,
  Zap,
  Gift,
  X, 
  ChevronRight, 
  Info,
  ExternalLink,
  Loader2,
  AlertCircle,
  Home,
  User,
  TrendingUp,
  Clock,
  LayoutGrid,
  Star,
  Trophy,
  Crown,
  MessageCircle,
  Pencil,
  Settings,
  Share2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { xtreamApi, DEFAULT_CREDENTIALS } from './lib/api';
import { XtreamCredentials, Category, Stream, Series, LiveStream } from './types';
import VideoPlayer from './components/VideoPlayer';
import IntroLoading from './components/IntroLoading';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc, getDocFromServer, collection, addDoc, deleteDoc, query, orderBy, updateDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signInAnonymously } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [creds, setCreds] = useState<XtreamCredentials>(() => {
    const saved = localStorage.getItem('iptv_creds');
    const loggedIn = localStorage.getItem('iptv_logged_in') === 'true';
    if (loggedIn && saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_CREDENTIALS;
      }
    }
    return DEFAULT_CREDENTIALS;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('iptv_logged_in') === 'true';
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'movies' | 'series' | 'live' | 'free'>('home');
  const [activeFreeTab, setActiveFreeTab] = useState<'menu' | 'movies' | 'series'>('menu');
  const [movieCategories, setMovieCategories] = useState<Category[]>([]);
  const [seriesCategories, setSeriesCategories] = useState<Category[]>([]);
  const [liveCategories, setLiveCategories] = useState<Category[]>([]);
  const [selectedMovieCategory, setSelectedMovieCategory] = useState<string>('0');
  const [selectedSeriesCategory, setSelectedSeriesCategory] = useState<string>('0');
  const [selectedLiveCategory, setSelectedLiveCategory] = useState<string>('0');
  const [movieItems, setMovieItems] = useState<Stream[]>([]);
  const [seriesItems, setSeriesItems] = useState<Series[]>([]);
  const [liveItems, setLiveItems] = useState<LiveStream[]>([]);
  const [totalMovieCount, setTotalMovieCount] = useState(0);
  const [totalSeriesCount, setTotalSeriesCount] = useState(0);
  const [totalLiveCount, setTotalLiveCount] = useState(0);
  const [homeData, setHomeData] = useState<{
    popularMovies: any[],
    popularSeries: any[]
  }>(() => {
    const saved = localStorage.getItem('iptv_home_cache');
    return saved ? JSON.parse(saved) : { popularMovies: [], popularSeries: [] };
  });
  const [loadingHome, setLoadingHome] = useState(false);
  const [loadingMovies, setLoadingMovies] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingOnServer, setSearchingOnServer] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Stream | Series | null>(null);
  const [seriesInfo, setSeriesInfo] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [playingLiveStream, setPlayingLiveStream] = useState<LiveStream | null>(null);
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [pendingDownload, setPendingDownload] = useState<{item: any, episodeId?: string, episodeExt?: string} | null>(null);
  const [showPSLPlayer, setShowPSLPlayer] = useState(false);
  const [showIPLPlayer, setShowIPLPlayer] = useState(false);
  const [selectedFreeMovie, setSelectedFreeMovie] = useState<any>(null);
  const [selectedFreeSeries, setSelectedFreeSeries] = useState<any>(null);
  const [freeMovies, setFreeMovies] = useState<any[]>([]);
  const [freeSeries, setFreeSeries] = useState<any[]>([]);
  const [isMoviesLoading, setIsMoviesLoading] = useState(true);
  const [isSeriesLoading, setIsSeriesLoading] = useState(true);
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);

  const [newFreeMovie, setNewFreeMovie] = useState({ name: '', poster_url: '', play_url: '', download_url: '', is_embed: false });
  const [newFreeSeries, setNewFreeSeries] = useState({ name: '', poster_url: '', play_url: '', download_url: '', is_embed: false });
  const [selectedPslLanguage, setSelectedPslLanguage] = useState<'urdu' | 'english' | 'custom' | null>(null);
  const [pslUrlUrdu, setPslUrlUrdu] = useState('');
  const [pslUrlEnglish, setPslUrlEnglish] = useState('');
  const [pslChannel3Name, setPslChannel3Name] = useState('Channel 3');
  const [pslChannel3Url, setPslChannel3Url] = useState('');
  const [pslChannel3IsEmbed, setPslChannel3IsEmbed] = useState(false);
  const [pslChannel3ShowLiveIcon, setPslChannel3ShowLiveIcon] = useState(true);
  const [iplUrl, setIplUrl] = useState('');
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [appSettings, setAppSettings] = useState({
    psl_enabled: true,
    ipl_enabled: true,
    free_movies_enabled: true,
    free_series_enabled: true,
    psl_title: 'PSL',
    ipl_title: 'IPL',
    free_movies_title: 'FREE CINEMA',
    free_series_title: 'FREE BINGE'
  });
  const [newAppSettings, setNewAppSettings] = useState(appSettings);
  const [showWebPlayer, setShowWebPlayer] = useState(false);
  const [webPlayUrl, setWebPlayUrl] = useState('');
  const [webPlayTitle, setWebPlayTitle] = useState('');

  // Helper to determine if the bottom navigation should be hidden
  const shouldHideNav = !!(
    selectedItem || 
    selectedFreeMovie || 
    selectedFreeSeries || 
    showPSLPlayer || 
    showIPLPlayer || 
    showWebPlayer ||
    showLoginModal ||
    showAdminLogin ||
    showDownloadConfirm
  );
  const [newPslUrlUrdu, setNewPslUrlUrdu] = useState(pslUrlUrdu);
  const [newPslUrlEnglish, setNewPslUrlEnglish] = useState(pslUrlEnglish);
  const [newPslChannel3Name, setNewPslChannel3Name] = useState(pslChannel3Name);
  const [newPslChannel3Url, setNewPslChannel3Url] = useState(pslChannel3Url);
  const [newPslChannel3IsEmbed, setNewPslChannel3IsEmbed] = useState(pslChannel3IsEmbed);
  const [newPslChannel3ShowLiveIcon, setNewPslChannel3ShowLiveIcon] = useState(pslChannel3ShowLiveIcon);
  const [newIplUrl, setNewIplUrl] = useState(iplUrl);
  const [activeAdminTab, setActiveAdminTab] = useState<'psl' | 'ipl' | 'free_movies' | 'free_series' | 'app'>('psl');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showIntro, setShowIntro] = useState(() => {
    return localStorage.getItem('has_seen_intro') !== 'true';
  });
  const [introProgress, setIntroProgress] = useState(0);
  const [visibleCount, setVisibleCount] = useState(40);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'settings', 'psl'));
        console.log("Firestore Connection Test: Success");
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/psl');
      }
    };
    testConnection();
  }, []);

  // Real-time Firestore Sync for App Settings
  useEffect(() => {
    const appDocRef = doc(db, 'settings', 'app');
    const unsubscribe = onSnapshot(appDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const updated = {
          psl_enabled: data.psl_enabled ?? true,
          ipl_enabled: data.ipl_enabled ?? true,
          free_movies_enabled: data.free_movies_enabled ?? true,
          free_series_enabled: data.free_series_enabled ?? true,
          psl_title: data.psl_title || 'PSL',
          ipl_title: data.ipl_title || 'IPL',
          free_movies_title: data.free_movies_title || 'FREE CINEMA',
          free_series_title: data.free_series_title || 'FREE BINGE'
        };
        setAppSettings(updated);
        setNewAppSettings(updated);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/app');
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore Sync for PSL URL
  useEffect(() => {
    const pslDocRef = doc(db, 'settings', 'psl');
    const unsubscribe = onSnapshot(pslDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.psl_live_url_urdu) {
          setPslUrlUrdu(data.psl_live_url_urdu);
          setNewPslUrlUrdu(data.psl_live_url_urdu);
        }
        if (data.psl_live_url_english) {
          setPslUrlEnglish(data.psl_live_url_english);
          setNewPslUrlEnglish(data.psl_live_url_english);
        }
        if (data.psl_channel3_name) {
          setPslChannel3Name(data.psl_channel3_name);
          setNewPslChannel3Name(data.psl_channel3_name);
        }
        if (data.psl_channel3_url) {
          setPslChannel3Url(data.psl_channel3_url);
          setNewPslChannel3Url(data.psl_channel3_url);
        }
        setPslChannel3IsEmbed(!!data.psl_channel3_is_embed);
        setNewPslChannel3IsEmbed(!!data.psl_channel3_is_embed);
        if (data.psl_channel3_show_live_icon !== undefined) {
          setPslChannel3ShowLiveIcon(data.psl_channel3_show_live_icon);
          setNewPslChannel3ShowLiveIcon(data.psl_channel3_show_live_icon);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/psl');
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore Sync for IPL URL
  useEffect(() => {
    const iplDocRef = doc(db, 'settings', 'ipl');
    const unsubscribe = onSnapshot(iplDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.ipl_live_url) {
          setIplUrl(data.ipl_live_url);
          setNewIplUrl(data.ipl_live_url);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/ipl');
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore Sync for Free Movies
  useEffect(() => {
    const freeMoviesRef = collection(db, 'free_movies');
    const q = query(freeMoviesRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const movies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFreeMovies(movies);
      setIsMoviesLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'free_movies');
      setIsMoviesLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time Firestore Sync for Free Web Series
  useEffect(() => {
    const freeSeriesRef = collection(db, 'free_series');
    const q = query(freeSeriesRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const series = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFreeSeries(series);
      setIsSeriesLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'free_series');
      setIsSeriesLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        const pslDocRef = doc(db, 'settings', 'psl');
        await getDocFromServer(pslDocRef);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/psl');
      }
    };
    testConnection();
  }, []);

  const pslOptions = useMemo(() => {
    let url = '';
    let isEmbed = false;

    if (selectedPslLanguage === 'urdu') {
      url = pslUrlUrdu;
    } else if (selectedPslLanguage === 'english') {
      url = pslUrlEnglish;
    } else if (selectedPslLanguage === 'custom') {
      url = pslChannel3Url;
      isEmbed = pslChannel3IsEmbed;
    }

    // Ensure .ts for Live TV if not an embed and not already present
    if (url && !isEmbed && !url.toLowerCase().includes('.m3u8') && !url.toLowerCase().includes('.mp4') && !url.toLowerCase().includes('.mkv') && !url.toLowerCase().includes('.ts')) {
      url = url.endsWith('/') ? `${url.slice(0, -1)}.ts` : `${url}.ts`;
    }

    const isMp4 = url.toLowerCase().includes('.mp4');
    const isHls = url.toLowerCase().includes('.m3u8');
    const isTs = url.toLowerCase().includes('.ts');
    
    return {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: false,
      fill: true,
      preload: 'auto',
      is_embed: isEmbed,
      skipProxy: true,
      sources: [{
        src: url,
        type: isHls ? 'application/x-mpegURL' : (isMp4 ? 'video/mp4' : (isTs ? 'video/mp2t' : 'video/mp4'))
      }]
    };
  }, [pslUrlUrdu, pslUrlEnglish, pslChannel3Url, pslChannel3IsEmbed, selectedPslLanguage]);

  const iplOptions = useMemo(() => {
    let url = iplUrl;
    // Ensure .ts for Live TV if not already present
    if (url && !url.toLowerCase().includes('.m3u8') && !url.toLowerCase().includes('.mp4') && !url.toLowerCase().includes('.mkv') && !url.toLowerCase().includes('.ts')) {
      url = url.endsWith('/') ? `${url.slice(0, -1)}.ts` : `${url}.ts`;
    }

    const isMp4 = url.toLowerCase().includes('.mp4');
    const isHls = url.toLowerCase().includes('.m3u8');
    const isTs = url.toLowerCase().includes('.ts');
    
    return {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: false,
      fill: true,
      preload: 'auto',
      skipProxy: true,
      sources: [{
        src: url,
        type: isHls ? 'application/x-mpegURL' : (isMp4 ? 'video/mp4' : (isTs ? 'video/mp2t' : 'video/mp4'))
      }]
    };
  }, [iplUrl]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPassword === 'sajid122') {
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Check if user is the bootstrapped admin
        if (user.email === 'sjstoreuk17@gmail.com') {
          setIsAdminLoggedIn(true);
          setShowAdminLogin(false);
          setAdminPassword('');
        } else {
          // Check if they exist in admins collection
          const adminDoc = await getDocFromServer(doc(db, 'admins', user.uid));
          if (adminDoc.exists()) {
            setIsAdminLoggedIn(true);
            setShowAdminLogin(false);
            setAdminPassword('');
          } else {
            alert('Your Google account is not authorized as an administrator.');
            await auth.signOut();
          }
        }
      } catch (err: any) {
        console.error("Admin Google login failed", err);
        alert(`Login failed: ${err.message}`);
      }
    } else {
      alert('Invalid password');
    }
  };

  const handleUpdateUrl = async () => {
    try {
      if (activeAdminTab === 'app') {
        const docRef = doc(db, 'settings', 'app');
        await setDoc(docRef, { ...newAppSettings, updatedAt: new Date().toISOString() });
        alert("App Settings Updated Globally!");
        return;
      }

      const docId = activeAdminTab === 'psl' ? 'psl' : 'ipl';
      const docRef = doc(db, 'settings', docId);
      const data = activeAdminTab === 'psl' 
        ? { 
            psl_live_url_urdu: newPslUrlUrdu, 
            psl_live_url_english: newPslUrlEnglish, 
            psl_channel3_name: newPslChannel3Name,
            psl_channel3_url: newPslChannel3Url,
            psl_channel3_is_embed: newPslChannel3IsEmbed,
            psl_channel3_show_live_icon: newPslChannel3ShowLiveIcon,
            updatedAt: new Date().toISOString() 
          }
        : { ipl_live_url: newIplUrl, updatedAt: new Date().toISOString() };
      
      await setDoc(docRef, data);
      alert(`${activeAdminTab.toUpperCase()} URL Updated Globally!`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, activeAdminTab === 'app' ? 'settings/app' : `settings/${activeAdminTab}`);
    }
  };

  // Fetch series info when a series is selected
  useEffect(() => {
    if (selectedItem && 'series_id' in selectedItem) {
      const fetchInfo = async () => {
        setLoadingInfo(true);
        try {
          const info = await xtreamApi.getSeriesInfo(creds, (selectedItem as Series).series_id);
          setSeriesInfo(info);
          // Default to first season
          if (info.seasons && info.seasons.length > 0) {
            setSelectedSeason(info.seasons[0].season_number.toString());
          } else if (info.episodes && Object.keys(info.episodes).length > 0) {
            setSelectedSeason(Object.keys(info.episodes)[0]);
          }
        } catch (err) {
          console.error("Failed to fetch series info", err);
        } finally {
          setLoadingInfo(false);
        }
      };
      fetchInfo();
    } else {
      setSeriesInfo(null);
      setSelectedSeason(null);
    }
  }, [selectedItem, creds]);

  const [error, setError] = useState<string | null>(null);
  const isInitialMount = React.useRef(true);

  // Initialize data
  useEffect(() => {
    const initData = async () => {
      setLoadingHome(true);
      setError(null);
      setIntroProgress(5);

      try {
        // 0. Verify credentials first
        try {
          await xtreamApi.login(creds);
          setIntroProgress(15);
        } catch (loginErr) {
          console.warn("Login verification failed:", loginErr);
        }

        // 1. Fetch categories
        const [mCats, sCats, lCats] = await Promise.all([
          xtreamApi.getMovieCategories(creds),
          xtreamApi.getSeriesCategories(creds),
          xtreamApi.getLiveCategories(creds)
        ]).catch(err => {
          console.error("Failed to fetch categories", err);
          return [[], [], []];
        });
        
        setMovieCategories([{ category_id: '0', category_name: 'All Movies', parent_id: 0 }, ...mCats]);
        setSeriesCategories([{ category_id: '0', category_name: 'All Series', parent_id: 0 }, ...sCats]);
        setLiveCategories([{ category_id: '0', category_name: 'All Channels', parent_id: 0 }, ...lCats]);
        setIntroProgress(35);

        // 2. Fetch Home Data (Movies & Series sequentially to avoid 429)
        setLoadingMovies(true);
        let mItems: Stream[] = [];
        try {
          mItems = await xtreamApi.getMovies(creds, '0');
          setMovieItems(mItems);
          setTotalMovieCount(mItems.length);
          setIntroProgress(55);
        } catch (mErr) {
          console.error("Failed to fetch movies", mErr);
        } finally {
          setLoadingMovies(false);
        }

        // Small delay between heavy requests
        await new Promise(resolve => setTimeout(resolve, 500));

        setLoadingSeries(true);
        let sItems: Series[] = [];
        try {
          sItems = await xtreamApi.getSeries(creds, '0');
          setSeriesItems(sItems);
          setTotalSeriesCount(sItems.length);
          setIntroProgress(75);
        } catch (sErr) {
          console.error("Failed to fetch series", sErr);
        } finally {
          setLoadingSeries(false);
        }

        // Live items are fetched only when tab active or after a longer delay
        setIntroProgress(90);

        // 3. Set Home Data
        if (mItems.length > 0 || sItems.length > 0) {
          const sortedMovies = [...mItems].sort((a, b) => (parseInt(b.added) || 0) - (parseInt(a.added) || 0));
          const sortedSeries = [...sItems].sort((a, b) => (parseInt(b.last_modified) || 0) - (parseInt(a.last_modified) || 0));

          const newData = {
            popularMovies: sortedMovies.slice(0, 20),
            popularSeries: sortedSeries.slice(0, 20)
          };
          
          setHomeData(newData);
          localStorage.setItem('iptv_home_cache', JSON.stringify(newData));
          setIntroProgress(100);
        } else if (homeData.popularMovies.length === 0) {
          // If completely empty after wait, show error
          if (!loadingMovies && !loadingSeries) {
            setError("No content found on the server. Please check your IPTV subscription.");
          }
          setIntroProgress(100);
        }
      } catch (err: any) {
        console.error("Critical failure during initialization", err);
        const errorMessage = err.response?.data?.error || err.message || "Failed to connect to IPTV server.";
        const hint = err.response?.data?.hint ? `\nHint: ${err.response.data.hint}` : "";
        setError(`${errorMessage}${hint}`);
        setIntroProgress(100);
      } finally {
        setLoadingHome(false);
      }
    };

    initData();
    isInitialMount.current = false;
  }, [creds]);

  // Fetch Movie items when category changes
  useEffect(() => {
    // Skip if it's initial mount and category is 0 (already fetched in initData)
    // Also skip if we already have items for category 0
    if (selectedMovieCategory === '0' && movieItems.length > 0) return;

    const fetchMovies = async () => {
      setLoadingMovies(true);
      setError(null);
      try {
        const data = await xtreamApi.getMovies(creds, selectedMovieCategory);
        setMovieItems(data);
      } catch (err: any) {
        console.error("Failed to fetch movies", err);
        setError(err.message || "Failed to fetch movies for this category.");
      } finally {
        setLoadingMovies(false);
      }
    };
    fetchMovies();
  }, [creds, selectedMovieCategory]);

  // Fetch Series items when category changes
  useEffect(() => {
    // Skip if it's initial mount and category is 0 (already fetched in initData)
    if (selectedSeriesCategory === '0' && seriesItems.length > 0) return;

    const fetchSeries = async () => {
      setLoadingSeries(true);
      setError(null);
      try {
        const data = await xtreamApi.getSeries(creds, selectedSeriesCategory);
        setSeriesItems(data);
      } catch (err: any) {
        console.error("Failed to fetch series", err);
        setError(err.message || "Failed to fetch series for this category.");
      } finally {
        setLoadingSeries(false);
      }
    };
    fetchSeries();
  }, [creds, selectedSeriesCategory]);

  // Fetch Live TV items when category changes or when live tab is active and items are empty
  useEffect(() => {
    // Only fetch if tab is live OR if it's category change
    if (activeTab !== 'live' && selectedLiveCategory === '0') return;
    if (selectedLiveCategory === '0' && liveItems.length > 0) return;

    const fetchLive = async () => {
      setLoadingLive(true);
      setError(null);
      try {
        const data = await xtreamApi.getLiveStreams(creds, selectedLiveCategory);
        setLiveItems(data);
        setTotalLiveCount(data.length);
      } catch (err: any) {
        console.error("Failed to fetch live streams", err);
        setError(err.message || "Failed to fetch channels for this category.");
      } finally {
        setLoadingLive(false);
      }
    };
    fetchLive();
  }, [creds, selectedLiveCategory, activeTab]);

  const handleItemClick = (item: any) => {
    setSelectedItem(item);
  };

  const currentItems = useMemo(() => {
    const items = activeTab === 'movies' ? movieItems : (activeTab === 'series' ? seriesItems : liveItems);
    const filtered = searchQuery 
      ? items.filter((item: any) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items;
    return filtered.slice(0, visibleCount);
  }, [activeTab, movieItems, seriesItems, liveItems, searchQuery, visibleCount]);

  const hasMore = useMemo(() => {
    const items = activeTab === 'movies' ? movieItems : (activeTab === 'series' ? seriesItems : liveItems);
    const filtered = searchQuery 
      ? items.filter((item: any) => item.name.toLowerCase().includes(searchQuery.toLowerCase()))
      : items;
    return visibleCount < filtered.length;
  }, [activeTab, movieItems, seriesItems, liveItems, searchQuery, visibleCount]);

  const currentCategories = activeTab === 'movies' ? movieCategories : (activeTab === 'series' ? seriesCategories : liveCategories);
  const currentSelectedCategory = activeTab === 'movies' ? selectedMovieCategory : (activeTab === 'series' ? selectedSeriesCategory : selectedLiveCategory);
  const setCurrentSelectedCategory = activeTab === 'movies' ? setSelectedMovieCategory : (activeTab === 'series' ? setSelectedSeriesCategory : setSelectedLiveCategory);
  const currentLoading = activeTab === 'movies' ? loadingMovies : (activeTab === 'series' ? loadingSeries : loadingLive);

  // Reset visible items when category or search changes
  useEffect(() => {
    setVisibleCount(40);
  }, [activeTab, selectedMovieCategory, selectedSeriesCategory, selectedLiveCategory, searchQuery]);

  // Infinite scroll observer
  useEffect(() => {
    if (currentLoading) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !currentLoading) {
        setVisibleCount(prev => prev + 40);
      }
    }, { threshold: 0.1 });

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [currentLoading, activeTab, selectedMovieCategory, selectedSeriesCategory, selectedLiveCategory, searchQuery]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoginError('');
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const host = creds.host; // Use existing host, don't show in UI

    const userCreds = { host, username, password };

    try {
      const response = await xtreamApi.login(userCreds);
      if (response.user_info.status === 'Active' || response.user_info.auth === 1) {
        setCreds(userCreds);
        setIsLoggedIn(true);
        setShowLoginModal(false);
        setSelectedItem(null);
        localStorage.setItem('iptv_creds', JSON.stringify(userCreds));
        localStorage.setItem('iptv_logged_in', 'true');
      } else {
        setLoginError('Your username or password is not valid. Click here to register new account');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.response?.status === 404) {
        setLoginError('Your username or password is not valid. Click here to register new account');
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        setLoginError('Your username or password is not valid. Click here to register new account');
      } else {
        setLoginError('Failed to connect to server. Please check your internet and credentials.');
      }
    }
  };

  const handleLogout = () => {
    setCreds(DEFAULT_CREDENTIALS);
    setIsLoggedIn(false);
    localStorage.removeItem('iptv_creds');
    localStorage.removeItem('iptv_logged_in');
  };

  const handleAddFreeMovie = async () => {
    if (!newFreeMovie.name || !newFreeMovie.poster_url || !newFreeMovie.play_url) {
      alert("Please fill all required fields (Name, Poster URL, Play URL)");
      return;
    }
    try {
      if (editingMovieId) {
        await updateDoc(doc(db, 'free_movies', editingMovieId), {
          ...newFreeMovie,
          updatedAt: new Date().toISOString()
        });
        setEditingMovieId(null);
      } else {
        await addDoc(collection(db, 'free_movies'), {
          ...newFreeMovie,
          createdAt: new Date().toISOString()
        });
      }
      setNewFreeMovie({ name: '', poster_url: '', play_url: '', download_url: '', is_embed: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'free_movies');
    }
  };

  const handleDeleteFreeMovie = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this movie?")) return;
    try {
      await deleteDoc(doc(db, 'free_movies', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `free_movies/${id}`);
    }
  };

  const handleAddFreeSeries = async () => {
    if (!newFreeSeries.name || !newFreeSeries.play_url || !newFreeSeries.poster_url) {
      alert("Please fill all required fields");
      return;
    }
    try {
      if (editingSeriesId) {
        await updateDoc(doc(db, 'free_series', editingSeriesId), {
          ...newFreeSeries,
          updatedAt: new Date().toISOString()
        });
        setEditingSeriesId(null);
      } else {
        await addDoc(collection(db, 'free_series'), {
          ...newFreeSeries,
          createdAt: new Date().toISOString()
        });
      }
      setNewFreeSeries({ name: '', poster_url: '', play_url: '', download_url: '', is_embed: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'free_series');
    }
  };

  const handleDeleteFreeSeries = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this series?")) return;
    try {
      await deleteDoc(doc(db, 'free_series', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `free_series/${id}`);
    }
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatVlcUrl = (url: string) => {
    if (!url) return '';
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isAndroid = /Android/i.test(userAgent);

    if (isAndroid) {
      // Use the exact Intent format requested for Android
      return `intent:${url}#Intent;package=org.videolan.vlc;type=video/*;end;`;
    }

    // Fallback for non-Android (Desktop/iOS)
    return `vlc:${url}`;
  };

  const triggerDownload = (url: string, filename: string) => {
    const safeFilename = filename.replace(/[^a-z0-9.-]/gi, '_');
    const proxyUrl = `https://sjstore-sjstore-download-proxy.hf.space/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(safeFilename)}`;
    
    // Using window.location.assign for direct trigger to browser's native download manager
    // This is memory-safe and handles large files (GBs) correctly
    window.location.assign(proxyUrl);
  };

  const handleAction = async (action: 'play' | 'download' | 'web_play' | 'copy', item: any, episodeId?: string, episodeExt?: string, isConfirmed = false) => {
    if (!isLoggedIn) {
      setShowLoginModal(true);
      return;
    }

    // Ensure host is valid
    let host = creds.host.trim();
    if (!host || !creds.username || !creds.password) {
      alert("Please enter a valid server host, username, and password in settings.");
      return;
    }
    if (!host.startsWith('http')) {
      host = `http://${host}`;
    }
    // Remove trailing slash if exists
    host = host.replace(/\/$/, '');

    const isLive = !!(item as any).stream_type && (item as any).stream_type === 'live';
    const isSeries = !!(episodeId || (item as any).series_id);
    
    // If it's a series but no episodeId is provided, we can't play/download it directly
    if (isSeries && !episodeId && action !== 'web_play') {
      console.warn("Cannot perform action on series without an episode ID");
      return;
    }

    const streamId = episodeId || (item as any).stream_id || (item as any).id;
    
    if (!streamId) {
      console.error("No stream ID found for item", item);
      alert("Could not find the video file for this item. Please try an episode instead.");
      setDownloading(null);
      return;
    }

    let ext = isLive ? 'ts' : (episodeExt || (item as any).container_extension || 'mp4');
    const type = isLive ? 'live' : (isSeries ? 'series' : 'movie');

    // For Web Player Live TV, we use .ts extension for raw stream playback via proxy
    if (action === 'web_play' && isLive) {
      ext = 'ts';
    }
    
    // Correct Xtream URL format: http://host:port/type/user/pass/id.ext
    const url = `${host}/${type}/${creds.username}/${creds.password}/${streamId}.${ext}`;
    
    if (action === 'web_play') {
      setWebPlayUrl(url);
      setWebPlayTitle((item as any).name || (selectedItem as any)?.name || 'Title');
      setShowWebPlayer(true);
      return;
    }

    if (action === 'download' && !isConfirmed) {
      if (downloading) {
        alert("Another download is already in progress. Please wait for it to complete.");
        return;
      }
      setPendingDownload({ item, episodeId, episodeExt });
      setShowDownloadConfirm(true);
      return;
    }

    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedId(streamId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (err) {
        console.error('Failed to copy: ', err);
      }
      return;
    }

    if (action === 'download') {
      setDownloading(streamId);
      const filename = `${(item as any).name || 'video'}.${ext}`;
      triggerDownload(url, filename);

      // Reset after some time since we can't track completion
      setTimeout(() => setDownloading(null), 30000);
      return;
    } else {
      if (downloading) {
        alert("Download in progress. Please wait for it to complete before playing content.");
        return;
      }
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      const isAndroid = /Android/i.test(userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(userAgent);

      if (isMobile) {
        if (isAndroid) {
          // Use the consolidated VLC Intent/scheme formatter
          window.location.href = formatVlcUrl(url);
        } else if (isIOS) {
          // iOS - try vlc:// as a common player scheme
          const vlcUrl = formatVlcUrl(url);
          window.location.href = vlcUrl;
        } else {
          window.open(url, '_blank');
        }
      } else {
        // Desktop/PC - use vlc:// protocol scheme
        const vlcUrl = formatVlcUrl(url);
        window.location.href = vlcUrl;
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#020617] text-white selection:bg-cyan-500/30 selection:text-cyan-200">
      <AnimatePresence>
        {showIntro && (
          <IntroLoading 
            progress={introProgress} 
            onComplete={() => {
              setShowIntro(false);
              localStorage.setItem('has_seen_intro', 'true');
            }} 
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-dark px-4 md:px-6 py-3 md:py-4 safe-top flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex flex-col -space-y-1">
            <h1 className="text-xl md:text-2xl font-display font-bold text-gradient tracking-tighter flex items-center italic">
              <span className="text-cyan-400">4K</span><span className="text-white">·SJ</span>
            </h1>
            <span className="text-[8px] md:text-[10px] text-cyan-400/60 font-bold uppercase tracking-[0.2em] pl-1 italic">Premium Experience</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <button 
              onClick={() => { setActiveTab('home'); }}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-all hover:scale-105",
                activeTab === 'home' ? "text-cyan-400" : "text-white/60 hover:text-white"
              )}
            >
              <Home size={18} /> Home
            </button>
            <button 
              onClick={() => { setActiveTab('movies'); setSelectedMovieCategory('0'); }}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-all hover:scale-105",
                activeTab === 'movies' ? "text-cyan-400" : "text-white/60 hover:text-white"
              )}
            >
              <Film size={18} /> Movies
            </button>
            <button 
              onClick={() => { setActiveTab('series'); setSelectedSeriesCategory('0'); }}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-all hover:scale-105",
                activeTab === 'series' ? "text-cyan-400" : "text-white/60 hover:text-white"
              )}
            >
              <Tv size={18} /> Web Series
            </button>
            <button 
              onClick={() => { setActiveTab('live'); setSelectedLiveCategory('0'); }}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-all hover:scale-105",
                activeTab === 'live' ? "text-cyan-400" : "text-white/60 hover:text-white"
              )}
            >
              <LayoutGrid size={18} /> Live TV
            </button>
            <button 
              onClick={() => { setActiveTab('free'); setActiveFreeTab('menu'); }}
              className={cn(
                "flex items-center gap-2 text-sm font-medium transition-all hover:scale-105",
                activeTab === 'free' ? "text-cyan-400 font-bold" : "text-white/60 hover:text-white"
              )}
            >
              <div className="relative">
                <Play size={18} className="fill-current opacity-40 group-hover:opacity-100 transition-opacity" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse border border-black" />
              </div>
               Watch Free
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-cyan-400 transition-colors" size={14} />
            <input 
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-full py-1.5 md:py-2 pl-9 pr-4 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 w-24 sm:w-48 md:w-64 transition-all focus:w-32 sm:focus:w-64 md:focus:w-80"
            />
          </div>
          
          {isLoggedIn ? (
            <div className="flex items-center gap-2 md:gap-3">
              <span className="text-[10px] text-white/40 hidden lg:block">Logged in as: <span className="text-white/80 font-medium">{creds.username}</span></span>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-white/10 rounded-full transition-all hover:rotate-12 text-white/60 hover:text-white"
                title="Logout"
              >
                <LogOut size={18} className="md:w-5 md:h-5" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-semibold transition-all shadow-lg shadow-cyan-900/20 active:scale-95"
            >
              <LogIn size={14} className="md:w-4 md:h-4" /> Login
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 space-y-6 md:space-y-8 pb-24 md:pb-8">
        {activeTab === 'home' ? (
          <div className="space-y-10">
            {loadingHome && homeData.popularMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <Loader2 className="animate-spin text-cyan-500" size={48} />
                <p className="text-white/40 font-medium">Loading Home Content...</p>
              </div>
            ) : error && homeData.popularMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 gap-6 text-center max-w-md mx-auto px-6">
                <div className="p-4 bg-red-500/10 rounded-full">
                  <AlertCircle className="text-red-500" size={48} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Connection Issue</h3>
                  <p className="text-white/40 text-sm">{error}</p>
                </div>
                <button 
                  onClick={() => window.location.reload()}
                  className="bg-cyan-500 text-black px-8 py-3 rounded-xl font-bold hover:bg-cyan-400 transition-all"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {/* Hero Slider (First Popular Movie) */}
                {homeData.popularMovies.length > 0 && (
                  <div className="relative h-[400px] md:h-[600px] rounded-2xl md:rounded-[2.5rem] overflow-hidden group shadow-2xl shadow-cyan-500/10">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={homeData.popularMovies[0].stream_id}
                        initial={{ opacity: 0, scale: 1.1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.8 }}
                        className="absolute inset-0"
                      >
                        <img 
                          src={homeData.popularMovies[0].stream_icon || null}
                          alt={homeData.popularMovies[0].name}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-[2s]"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/movie/1200/800?blur=2'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                        <div className="absolute bottom-0 left-0 p-8 md:p-16 space-y-4 md:space-y-6 max-w-2xl">
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="flex items-center gap-3"
                          >
                            <span className="px-4 py-1 bg-cyan-500/20 text-cyan-400 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] rounded-full border border-cyan-500/30 backdrop-blur-md">
                              Featured Content
                            </span>
                            {homeData.popularMovies[0].rating && (
                              <span className="text-yellow-500 font-bold flex items-center gap-1 text-sm md:text-base">
                                ★ {homeData.popularMovies[0].rating}
                              </span>
                            )}
                          </motion.div>
                          <motion.h2 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 }}
                            className="text-4xl md:text-7xl font-display font-bold leading-tight drop-shadow-2xl"
                          >
                            {homeData.popularMovies[0].name}
                          </motion.h2>
                          <motion.div 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            className="flex items-center gap-4 pt-4"
                          >
                            <button 
                              onClick={() => handleItemClick(homeData.popularMovies[0])}
                              className="premium-button premium-button-primary md:px-10 md:py-4 md:text-lg"
                            >
                              <Play size={24} fill="black" /> Watch Now
                            </button>
                            <button 
                              onClick={() => handleItemClick(homeData.popularMovies[0])}
                              className="premium-button premium-button-secondary md:px-10 md:py-4 md:text-lg"
                            >
                              <Info size={24} /> Details
                            </button>
                          </motion.div>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}

                {/* Recently Added Movies */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xl md:text-3xl font-bold flex items-center gap-3">
                      <Film className="text-cyan-400" size={28} /> Recently Added Movies
                    </h3>
                    <button 
                      onClick={() => setActiveTab('movies')}
                      className="text-cyan-400 text-sm font-bold hover:text-cyan-300 transition-colors flex items-center gap-1"
                    >
                      View All <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-6">
                    {homeData.popularMovies.map((item, idx) => (
                      <motion.div 
                        key={`home-movie-${item.stream_id}-${idx}`}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ 
                          type: "spring",
                          damping: 20,
                          stiffness: 100,
                          delay: idx * 0.03 
                        }}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleItemClick(item)}
                        className="group cursor-pointer space-y-2"
                      >
                        <div className="premium-card aspect-[2/3]">
                          <img 
                            src={item.stream_icon || null} 
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/movie/400/600?blur=2'; }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                            <div className="flex items-center gap-2 bg-cyan-500 text-black px-3 py-1.5 rounded-full text-[10px] font-bold transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                              <Play size={10} fill="currentColor" /> Watch Now
                            </div>
                          </div>
                        </div>
                        <h4 className="text-[10px] md:text-sm font-bold line-clamp-1 group-hover:text-cyan-400 transition-colors px-1">{item.name}</h4>
                      </motion.div>
                    ))}
                  </div>
                </section>

                {/* Recently Added Web Series */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xl md:text-3xl font-bold flex items-center gap-3">
                      <Tv className="text-cyan-400" size={28} /> Recently Added Web Series
                    </h3>
                    <button 
                      onClick={() => setActiveTab('series')}
                      className="text-cyan-400 text-sm font-bold hover:text-cyan-300 transition-colors flex items-center gap-1"
                    >
                      View All <ChevronRight size={16} />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3 md:gap-6">
                    {homeData.popularSeries.map((item, idx) => (
                      <motion.div 
                        key={`home-series-${item.series_id}-${idx}`}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ 
                          type: "spring",
                          damping: 20,
                          stiffness: 100,
                          delay: idx * 0.03 
                        }}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleItemClick(item)}
                        className="group cursor-pointer space-y-2"
                      >
                        <div className="premium-card aspect-[2/3]">
                          <img 
                            src={item.cover || null} 
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/series/400/600?blur=2'; }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                            <div className="flex items-center gap-2 bg-cyan-500 text-black px-3 py-1.5 rounded-full text-[10px] font-bold transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                              <Play size={10} fill="currentColor" /> Watch Now
                            </div>
                          </div>
                        </div>
                        <h4 className="text-[10px] md:text-sm font-bold line-clamp-1 group-hover:text-cyan-400 transition-colors px-1">{item.name}</h4>
                      </motion.div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        ) : activeTab === 'live' ? (
          !isLoggedIn ? (
            <div className="flex flex-col items-center justify-center py-32 gap-6 text-center max-w-lg mx-auto px-6 glass rounded-[2.5rem] border border-white/20 shadow-2xl shadow-cyan-500/5">
              <div className="w-20 h-20 rounded-3xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 mb-2">
                <Lock size={40} className="text-cyan-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-display font-black text-white italic tracking-tighter uppercase">Live TV Locked</h3>
                <p className="text-white/40 text-sm font-medium italic tracking-wide max-w-xs mx-auto">
                  Premium Live TV signals are only accessible to registered users. Please login to continue.
                </p>
              </div>
              <button 
                onClick={() => setShowLoginModal(true)}
                className="premium-button premium-button-primary px-10 py-4 text-base shadow-lg shadow-cyan-500/20"
              >
                <LogIn size={20} /> Login to Access
              </button>
            </div>
          ) : (
          <div className="flex flex-col gap-6">
            {/* IPTV Layout for Live TV */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Player (Span 2) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="relative aspect-video rounded-[2rem] overflow-hidden bg-black border border-white/10 shadow-2xl group group-hover:border-cyan-500/50 transition-all duration-500">
                  {playingLiveStream ? (
                    <div className="w-full h-full">
                       <VideoPlayer 
                        key={`live-player-${playingLiveStream.stream_id}`}
                        options={{
                          autoplay: true,
                          controls: true,
                          responsive: true,
                          fluid: true,
                          is_embed: false,
                          isLive: true,
                          sources: [{
                            src: `${creds.host.replace(/\/$/, '')}/live/${creds.username}/${creds.password}/${playingLiveStream.stream_id}.ts`,
                            type: 'video/mp2t'
                          }]
                        }} 
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0a0b] group">
                      <div className="w-20 h-20 rounded-3xl bg-cyan-500/5 flex items-center justify-center border border-cyan-500/10 mb-6 group-hover:scale-110 transition-transform duration-500">
                        <Tv size={40} className="text-cyan-500/40" />
                      </div>
                      <h3 className="text-xl font-display font-bold text-white italic tracking-tight uppercase">Premium IPTV Player</h3>
                      <p className="text-white/30 text-xs mt-2 uppercase tracking-[0.2em] font-medium">Select a channel to start streaming</p>
                    </div>
                  )}
                </div>

                {playingLiveStream && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-row items-center justify-between p-2.5 sm:p-3 glass rounded-2xl border border-white/10 gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {playingLiveStream.stream_icon && (
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/10 bg-white/5 shrink-0 hidden xs:block">
                          <img 
                            src={playingLiveStream.stream_icon} 
                            alt=""
                            className="w-full h-full object-contain p-0.5"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/live/200/200?blur=1'; }}
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="text-[11px] sm:text-xs font-display font-black text-white italic tracking-tight uppercase truncate">{playingLiveStream.name}</h2>
                        <span className="text-[8px] text-cyan-400 font-bold uppercase tracking-widest block opacity-60 leading-none">1080P Signal</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button 
                        onClick={() => handleAction('copy', playingLiveStream)}
                        className="p-1.5 sm:p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-all border border-white/10 text-white/60 hover:text-white"
                        title="Copy"
                      >
                        {copiedId === playingLiveStream.stream_id ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                      </button>
                      <button 
                        onClick={() => window.location.href = formatVlcUrl(`${creds.host.replace(/\/$/, '')}/live/${creds.username}/${creds.password}/${playingLiveStream.stream_id}.ts`)}
                        className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-black text-[9px] transition-all shadow-lg shadow-orange-500/20 uppercase tracking-widest italic"
                      >
                        <Play size={12} fill="white" /> VLC
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Right Column: Categories & Channels List */}
              <div className="lg:h-[calc(100vh-280px)] min-h-[500px] flex flex-col gap-6">
                {/* Categories Scroll */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.3em] px-2 italic">Categories</h3>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {liveCategories.map((cat, idx) => (
                      <button
                        key={`iptv-cat-${cat.category_id}-${idx}`}
                        onClick={() => setSelectedLiveCategory(cat.category_id)}
                        className={cn(
                          "whitespace-nowrap px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 italic",
                          selectedLiveCategory === cat.category_id 
                            ? "bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.4)]" 
                            : "bg-white/5 text-white/40 hover:text-white border border-white/5 hover:border-white/10"
                        )}
                      >
                        {cat.category_name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Channels List Grid with Search */}
                <div className="flex-1 glass rounded-[2.5rem] border border-white/10 overflow-hidden flex flex-col min-h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest italic flex items-center gap-2">
                        <Tv size={14} className="text-cyan-400" /> Live Grid
                      </h3>
                      <span className="text-[10px] font-bold text-white/30 tracking-tighter">Category: {liveCategories.find(c => c.category_id === selectedLiveCategory)?.category_name || "All"}</span>
                    </div>
                    
                    {/* Channel Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                      <input 
                        type="text"
                        placeholder="Search Channel..."
                        value={liveSearchQuery}
                        onChange={(e) => setLiveSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-cyan-500/50 transition-all italic font-medium"
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                    {loadingLive ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <Loader2 className="animate-spin text-cyan-500" size={32} />
                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Scanning channels...</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {currentItems
                          .filter(item => item.name.toLowerCase().includes(liveSearchQuery.toLowerCase()))
                          .map((item, idx) => (
                          <motion.button
                            key={`iptv-channel-${(item as any).stream_id}-${idx}`}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: Math.min(idx * 0.005, 0.1) }}
                            onClick={() => {
                              setPlayingLiveStream(item as any);
                              // Scroll to top on mobile when selecting a channel
                              if (window.innerWidth < 1024) {
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }
                            }}
                            className={cn(
                              "flex flex-col items-center gap-2 p-2 rounded-2xl transition-all border group relative aspect-square justify-center text-center",
                              playingLiveStream?.stream_id === (item as any).stream_id
                                ? "bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                : "bg-white/2 hover:bg-white/5 border-transparent hover:border-white/10"
                            )}
                          >
                            <div className="w-full aspect-square max-w-[50px] rounded-xl bg-black/40 border border-white/5 overflow-hidden flex items-center justify-center p-1.5 shrink-0 group-hover:scale-110 transition-transform duration-300">
                              {(item as any).stream_icon ? (
                                <img 
                                  src={(item as any).stream_icon} 
                                  alt="" 
                                  className="w-full h-full object-contain"
                                  onError={(e) => { (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/tv/100/100?blur=5'; }}
                                />
                              ) : (
                                <Tv size={20} className="text-white/20" />
                              )}
                            </div>
                            <h4 className={cn(
                              "text-[8px] font-black uppercase tracking-tight line-clamp-2 leading-tight px-1 italic",
                              playingLiveStream?.stream_id === (item as any).stream_id ? "text-cyan-400" : "text-white/60 group-hover:text-white"
                            )}>
                              {item.name}
                            </h4>
                            
                            {playingLiveStream?.stream_id === (item as any).stream_id && (
                              <div className="absolute top-1 right-1">
                                <motion.div 
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ repeat: Infinity, duration: 2 }}
                                  className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" 
                                />
                              </div>
                            )}
                          </motion.button>
                        ))}
                      </div>
                    )}
                    
                    {currentItems.length > 0 && currentItems.filter(item => item.name.toLowerCase().includes(liveSearchQuery.toLowerCase())).length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-white/20">
                        <Search size={32} className="mb-3 opacity-10" />
                        <span className="text-[10px] font-bold uppercase tracking-widest italic">No Channels Matching</span>
                      </div>
                    )}

                    {/* Scroll Sentinel for Lazy Loading */}
                    {hasMore && !loadingLive && (
                      <div 
                        ref={loadMoreRef} 
                        className="flex justify-center py-8"
                      >
                        <Loader2 className="animate-spin text-cyan-500/40" size={20} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) ) : activeTab === 'free' ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeFreeTab === 'menu' ? (
              <div className="relative max-w-4xl mx-auto space-y-12 py-8 px-4">
                <div className="text-center space-y-8">
                  <div className="flex flex-col items-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-700 rounded-[2.5rem] flex items-center justify-center mb-6 border border-white/30 shadow-[0_0_50px_rgba(34,211,238,0.3)] relative group overflow-hidden">
                      <Play className="text-white relative z-10 fill-white" size={48} />
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-30" 
                      />
                    </div>
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center justify-center gap-4 w-full">
                        <h2 className="text-5xl font-black text-white tracking-tighter italic uppercase whitespace-nowrap">
                          FREE <span className="text-cyan-400 uppercase">ACCESS</span>
                        </h2>
                        <motion.button 
                          whileHover={{ scale: 1.1, rotate: 180 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setShowAdminLogin(true)}
                          className="p-3 bg-white/5 hover:bg-cyan-500/20 rounded-2xl transition-all border border-white/10 group shadow-lg flex items-center justify-center"
                        >
                          <Settings size={28} className="text-white/40 group-hover:text-cyan-400" />
                        </motion.button>
                      </div>
                      <p className="text-white/40 font-medium tracking-[0.2em] uppercase text-xs italic">Experience 4K•SJ Luxury Without Login</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2 md:px-4 max-w-5xl mx-auto">
                  {[
                    { 
                      id: 'psl',
                      label: 'CRICKET LIVE', 
                      title: appSettings.psl_title || 'PSL', 
                      icon: <Play size={28} className="text-white fill-white drop-shadow-lg" />, 
                      color: 'from-emerald-400 to-green-600', 
                      glow: 'shadow-emerald-500/20',
                      border: 'border-emerald-500/20',
                      enabled: appSettings.psl_enabled,
                      onClick: () => { setSelectedPslLanguage('urdu'); setShowPSLPlayer(true); }
                    },
                    { 
                      id: 'ipl',
                      label: 'IPL LIVE', 
                      title: appSettings.ipl_title || 'IPL', 
                      icon: (
                        <img 
                          src="https://upload.wikimedia.org/wikipedia/en/thumb/8/84/Indian_Premier_League_Official_Logo.svg/200px-Indian_Premier_League_Official_Logo.svg.png" 
                          className="w-10 h-10 md:w-14 md:h-14 object-contain brightness-110 contrast-125" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            if (target.src !== 'https://www.iplt20.com/assets/images/IPL-logo-new-old.png') {
                              target.src = 'https://www.iplt20.com/assets/images/IPL-logo-new-old.png';
                            }
                          }}
                        />
                      ), 
                      color: 'from-blue-400 to-indigo-600', 
                      glow: 'shadow-blue-500/20',
                      border: 'border-blue-500/20',
                      enabled: appSettings.ipl_enabled,
                      onClick: () => { setShowIPLPlayer(true); }
                    },
                    { 
                      id: 'movies',
                      label: 'MOVIES', 
                      title: appSettings.free_movies_title || 'M O V I E S', 
                      icon: <Film size={28} className="text-white drop-shadow-lg" />, 
                      color: 'from-cyan-400 to-blue-600', 
                      glow: 'shadow-cyan-500/20',
                      border: 'border-cyan-500/20',
                      enabled: appSettings.free_movies_enabled,
                      showLive: false,
                      onClick: () => { setActiveFreeTab('movies'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                    },
                    { 
                      id: 'series',
                      label: 'WEB SERIES', 
                      title: appSettings.free_series_title || 'WEB SERIES', 
                      icon: <Tv size={28} className="text-white drop-shadow-lg" />, 
                      color: 'from-purple-400 to-indigo-600', 
                      glow: 'shadow-purple-500/20',
                      border: 'border-purple-500/20',
                      enabled: appSettings.free_series_enabled,
                      showLive: false,
                      onClick: () => { setActiveFreeTab('series'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                    }
                  ].filter(item => item.enabled).map((item, i) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
                      whileHover={{ y: -10, scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={item.onClick}
                      className={cn(
                        "group relative p-6 md:p-10 rounded-[2.5rem] bg-black/40 flex flex-col items-center justify-center gap-6 transition-all duration-500 shadow-2xl backdrop-blur-xl overflow-hidden min-h-[160px] md:min-h-[260px] border",
                        item.border,
                        item.glow
                      )}
                    >
                      {/* Animated Glow Background */}
                      <div className={cn(
                        "absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br opacity-10 group-hover:opacity-30 blur-3xl transition-opacity duration-700",
                        item.color
                      )} />
                      
                      <div className={cn(
                        "w-16 h-16 md:w-24 md:h-24 bg-gradient-to-br rounded-3xl flex items-center justify-center shadow-2xl ring-1 ring-white/20 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 relative overflow-hidden",
                        item.color
                      )}>
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        {item.icon}
                      </div>

                      <div className="text-center space-y-2 relative z-10">
                        <p className="text-[8px] md:text-[11px] text-white/50 font-black uppercase tracking-[0.3em] font-display">{item.label}</p>
                        <h4 className="text-white font-display font-black text-xs md:text-2xl italic tracking-tight uppercase leading-none">{item.title}</h4>
                      </div>

                      {/* Premium Badge - Only for Live sections */}
                      {(item.showLive !== false) && (
                        <div className="absolute top-4 right-4">
                          <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/5 backdrop-blur-md">
                            <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", `bg-${item.color.split('-')[1]}`)} />
                            <span className="text-[6px] font-black text-white/40 uppercase tracking-widest">Live</span>
                          </div>
                        </div>
                      )}
                    </motion.button>
                  ))}
                  { [appSettings.psl_enabled, appSettings.ipl_enabled, appSettings.free_movies_enabled, appSettings.free_series_enabled].every(e => !e) && (
                    <div className="col-span-full py-20 text-center space-y-6 animate-in fade-in zoom-in duration-500">
                      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10 shadow-inner">
                        <AlertCircle className="text-white/10" size={48} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-white/40 font-black uppercase tracking-[0.3em] text-xs">Service Maintenance</p>
                        <p className="text-white/20 text-[10px] uppercase font-medium tracking-widest">Premium Categories are currently private</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center pt-8">
                  <div className="px-8 py-4 glass rounded-3xl border border-white/10 text-center max-w-sm mx-auto">
                    <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] italic">
                      Proprietary Delivery • Ultra-Stream Engine • 4K•SJ Luxury Access
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 pb-12">
                <div className="flex flex-col md:flex-row items-center justify-between px-4 gap-4">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setActiveFreeTab('menu')}
                      className="flex items-center gap-2 text-white/40 hover:text-white font-black uppercase text-xs tracking-widest transition-all bg-white/5 px-6 py-3 rounded-2xl border border-white/10"
                    >
                      <ArrowLeft size={18} /> Back to Free Menu
                    </button>
                    <button 
                      onClick={() => setShowAdminLogin(true)}
                      className="p-3 bg-white/5 hover:bg-cyan-500/20 rounded-2xl transition-all border border-white/10 group shadow-lg"
                    >
                      <Settings size={18} className="text-white/40 group-hover:text-cyan-400" />
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeFreeTab === 'movies' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'}`}>
                      {activeFreeTab === 'movies' ? <Film size={20} /> : <Tv size={20} />}
                    </div>
                    <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">
                      {activeFreeTab === 'movies' ? 'Free Movies' : 'Free Series'}
                    </h3>
                  </div>
                </div>

                <div className="px-4">
                  {activeFreeTab === 'movies' ? (
                    isMoviesLoading ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="animate-spin text-cyan-500" size={48} />
                        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Loading Premium Movies...</p>
                      </div>
                    ) : freeMovies.length === 0 ? (
                      <div className="text-center py-20 glass rounded-[3rem] border border-white/5">
                        <Film size={48} className="text-white/10 mx-auto mb-4" />
                        <p className="text-white/40 font-bold italic">No free movies found at this time.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {freeMovies.map((movie: any) => (
                          <motion.div 
                            key={movie.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -8, scale: 1.02 }}
                            className="group cursor-pointer"
                            onClick={() => { setSelectedFreeMovie(movie); }}
                          >
                            <div className="aspect-[2/3] rounded-[2rem] overflow-hidden border border-white/10 bg-white/5 relative shadow-2xl">
                              <img 
                                src={movie.poster_url} 
                                alt={movie.name} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-5">
                                <h4 className="text-white font-black text-sm italic tracking-tighter line-clamp-2 uppercase leading-tight mb-2 group-hover:text-cyan-400 transition-colors">{movie.name}</h4>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-[8px] font-black text-cyan-400 uppercase tracking-widest">Premium</span>
                                </div>
                              </div>
                              <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <div className="w-14 h-14 rounded-full bg-cyan-500 flex items-center justify-center shadow-[0_0_30px_rgba(6,182,212,0.6)] scale-0 group-hover:scale-100 transition-transform duration-500">
                                  <Play size={28} className="text-white fill-white ml-1" />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )
                  ) : (
                    isSeriesLoading ? (
                      <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="animate-spin text-purple-500" size={48} />
                        <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Loading Premium Series...</p>
                      </div>
                    ) : freeSeries.length === 0 ? (
                      <div className="text-center py-20 glass rounded-[3rem] border border-white/5">
                        <Tv size={48} className="text-white/10 mx-auto mb-4" />
                        <p className="text-white/40 font-bold italic">No free series found at this time.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {freeSeries.map((series: any) => (
                          <motion.div 
                            key={series.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -8, scale: 1.02 }}
                            className="group cursor-pointer"
                            onClick={() => { setSelectedFreeSeries(series); }}
                          >
                            <div className="aspect-[2/3] rounded-[2rem] overflow-hidden border border-white/10 bg-white/5 relative shadow-2xl">
                              <img 
                                src={series.poster_url} 
                                alt={series.name} 
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-5">
                                <h4 className="text-white font-black text-sm italic tracking-tighter line-clamp-2 uppercase leading-tight mb-2 group-hover:text-purple-400 transition-colors">{series.name}</h4>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-purple-500/20 border border-purple-500/40 rounded-lg text-[8px] font-black text-purple-400 uppercase tracking-widest">Premium</span>
                                </div>
                              </div>
                              <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                <div className="w-14 h-14 rounded-full bg-purple-500 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.6)] scale-0 group-hover:scale-100 transition-transform duration-500">
                                  <Play size={28} className="text-white fill-white ml-1" />
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Premium Category Bar */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                    <LayoutGrid size={16} className="text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-display font-bold text-white tracking-tight">Categories</h3>
                </div>
                {!currentLoading && currentItems.length > 0 && (
                  <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                      {currentItems.length} {currentItems.length > 200 ? "Titles Available" : "Titles"}
                    </span>
                  </div>
                )}
              </div>

              <div className="relative group">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 snap-x snap-mandatory">
                  {currentCategories.map((cat, idx) => (
                    <button
                      key={`${activeTab}-cat-${cat.category_id}-${idx}`}
                      onClick={() => setCurrentSelectedCategory(cat.category_id)}
                      className={cn(
                        "relative whitespace-nowrap px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold transition-all duration-300 snap-start gpu",
                        currentSelectedCategory === cat.category_id 
                          ? "text-black" 
                          : "text-white/50 hover:text-white bg-white/5 border border-white/5 hover:border-white/20"
                      )}
                    >
                      {currentSelectedCategory === cat.category_id && (
                        <motion.div
                          layoutId="activeCategory"
                          className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <div className="relative z-10 flex flex-col items-center">
                        <span className="leading-tight">{cat.category_name}</span>
                        {cat.category_id === '0' && (
                          <span className="text-[8px] md:text-[9px] opacity-60 font-medium mt-0.5">
                            {activeTab === 'movies' ? totalMovieCount : (activeTab === 'series' ? totalSeriesCount : totalLiveCount)} Items
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
                {/* Fade edges */}
                <div className="absolute top-0 right-0 bottom-2 w-12 bg-gradient-to-l from-[#020617] to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Content Grid */}
            {currentLoading ? (
              <div className="flex flex-col items-center justify-center py-24 md:py-32 gap-4">
                <Loader2 className="animate-spin text-cyan-500" size={40} md:size={48} />
                <p className="text-white/40 text-sm md:text-base font-medium">Fetching premium content...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-24 md:py-32 gap-6 text-center max-w-md mx-auto px-6">
                <div className="p-4 bg-red-500/10 rounded-full">
                  <AlertCircle className="text-red-500" size={40} md:size={48} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg md:text-xl font-bold">Connection Issue</h3>
                  <p className="text-white/40 text-xs md:text-sm">{error}</p>
                </div>
                <button 
                  onClick={() => setCurrentSelectedCategory(currentSelectedCategory)} // Trigger re-fetch
                  className="bg-cyan-500 text-black px-6 md:px-8 py-2.5 md:py-3 rounded-xl font-bold hover:bg-cyan-400 transition-all text-sm md:text-base"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 md:gap-6">
                {currentItems.map((item, idx) => (
                    <motion.div
                      key={`${activeTab}-${'stream_id' in item ? item.stream_id : (item as any).series_id}-${idx}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ 
                        duration: 0.3,
                        delay: Math.min(idx * 0.02, 0.3) 
                      }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedItem(item)}
                      className="group cursor-pointer space-y-1 md:space-y-3 gpu"
                    >
                      <div className="relative aspect-[2/3] rounded-lg md:rounded-xl overflow-hidden shadow-2xl transition-transform group-hover:scale-105 border border-white/5 group-hover:border-cyan-500/50 gpu">
                        <img 
                          src={('stream_icon' in item ? (item as any).stream_icon : (item as Series).cover) || null} 
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/movie/400/600?blur=2';
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 md:p-4">
                          <div className="flex items-center gap-1 md:gap-2 bg-cyan-500/20 backdrop-blur-md px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[8px] md:text-xs font-bold text-cyan-400 border border-cyan-500/30">
                            <Play size={8} md:size={12} fill="currentColor" /> Watch
                          </div>
                        </div>
                      </div>
                      <div className="px-1">
                        <h3 className="text-[9px] md:text-sm font-semibold line-clamp-1 group-hover:text-cyan-400 transition-colors">{item.name}</h3>
                        <div className="flex items-center gap-1 md:gap-2 mt-0.5 md:mt-1">
                          <span className="text-[7px] md:text-[10px] uppercase tracking-wider text-white/40 font-bold">
                            {activeTab === 'movies' ? 'Movie' : (activeTab === 'series' ? 'Series' : 'Live TV')}
                          </span>
                          {item.rating && (
                            <span className="text-[7px] md:text-[10px] bg-cyan-500/10 text-cyan-400 px-1 md:px-1.5 rounded font-bold">
                              ★ {item.rating}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                {/* Scroll Sentinel for Lazy Loading */}
                {hasMore && !currentLoading && (
                  <div 
                    ref={loadMoreRef} 
                    className="flex justify-center py-12"
                  >
                    <div className="flex items-center gap-3 text-cyan-500 font-medium">
                      <Loader2 className="animate-spin" size={24} />
                      <span className="text-sm">Loading more titles...</span>
                    </div>
                  </div>
                )}
            </div>
          )}

          {!currentLoading && currentItems.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 md:py-32 text-white/40">
              <Search size={40} md:size={48} className="mb-4 opacity-20" />
              <p className="text-sm">No titles found in this category.</p>
            </div>
          )}
        </>
      )}
    </main>

      {/* Item Details Modal */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ 
                duration: 0.3,
                ease: "easeOut"
              }}
              className="relative w-full max-w-4xl glass-dark rounded-2xl md:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col md:flex-row max-h-[90vh] md:max-h-none border border-white/10 gpu"
            >
              <button 
                onClick={() => setSelectedItem(null)}
                className="absolute top-3 right-3 md:top-4 md:right-4 z-20 p-2 bg-black/50 hover:bg-black rounded-full transition-colors"
              >
                <X size={18} md:size={20} />
              </button>

              <div className="w-full md:w-2/5 bg-black/40 p-6 md:p-0 flex items-center justify-center shrink-0">
                <div className="w-44 md:w-full aspect-[2/3] md:aspect-auto rounded-xl overflow-hidden shadow-2xl border border-white/10">
                  <img 
                    src={('stream_icon' in selectedItem ? selectedItem.stream_icon : (selectedItem as Series).cover) || null} 
                    alt={selectedItem.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/movie/400/600?blur=2';
                    }}
                  />
                </div>
              </div>

              <div className="flex-1 p-5 md:p-8 flex flex-col justify-start space-y-4 md:space-y-6 overflow-y-auto no-scrollbar pb-10 md:pb-8">
                <div>
                  <div className="flex items-center gap-2 md:gap-3 mb-1 md:mb-2">
                    <span className="px-2 py-0.5 bg-cyan-600/20 text-cyan-400 text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded">
                      {('series_id' in selectedItem) ? 'Series' : 'Movie'}
                    </span>
                    {selectedItem.rating && (
                      <span className="text-yellow-500 font-bold flex items-center gap-1 text-xs md:text-sm">
                        ★ {selectedItem.rating}
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl md:text-4xl font-display font-bold leading-tight line-clamp-2 md:line-clamp-none">{selectedItem.name}</h2>
                </div>

                <p className="text-white/60 text-[10px] md:text-sm leading-relaxed line-clamp-2 md:line-clamp-4">
                  {'plot' in selectedItem ? selectedItem.plot : (seriesInfo?.info?.plot || "Enjoy high-quality streaming of this title. Experience the best in entertainment with 4K·SJ premium IPTV service.")}
                </p>

                {/* Action Buttons for Movies/Live */}
                { !(selectedItem as any).series_id ? (
                  <div className="flex flex-col gap-2 md:gap-4 pt-1 md:pt-4">
                    <button 
                      onClick={() => handleAction('web_play', selectedItem)}
                      className="flex items-center justify-center gap-2 md:gap-3 bg-[#00D1FF] text-black hover:bg-cyan-300 px-4 py-3 md:px-6 md:py-4 rounded-xl font-black transition-all transform hover:scale-105 text-sm md:text-base shadow-[0_0_25px_rgba(0,209,255,0.4)] uppercase tracking-widest"
                    >
                      <Play size={20} md:size={24} fill="black" /> 
                      <span>Play Online</span>
                    </button>

                    <button 
                      onClick={() => handleAction('play', selectedItem)}
                      title="Play in External Player (Only for Mobile Users)"
                      className="flex items-center justify-center gap-2 md:gap-3 bg-white/5 border border-white/10 text-white hover:bg-white/10 px-4 py-2.5 md:px-6 md:py-3 rounded-xl font-bold transition-all text-xs md:text-sm"
                    >
                      <Share2 size={16} md:size={18} /> 
                      <span>Open in External Player</span>
                    </button>
                    
                    {/* Copy Link for Movies/Live */}
                    <div className="space-y-1.5 md:space-y-2">
                      <button 
                        onClick={() => handleAction('copy', selectedItem)}
                        className={cn(
                          "w-full flex items-center justify-center gap-2 md:gap-3 px-4 py-2.5 md:px-6 md:py-3 rounded-xl font-bold transition-all border text-xs md:text-sm",
                          copiedId === ((selectedItem as any).stream_id || (selectedItem as any).id)
                            ? "bg-green-500/20 border-green-500/50 text-green-400" 
                            : "bg-white/5 hover:bg-white/10 border-white/5 text-white"
                        )}
                      >
                        {copiedId === ((selectedItem as any).stream_id || (selectedItem as any).id) ? <Check size={16} md:size={18} /> : <Copy size={16} md:size={18} />}
                        {copiedId === ((selectedItem as any).stream_id || (selectedItem as any).id) ? "Link Copied!" : ((selectedItem as any).stream_type === 'live' ? "Copy Channel Link" : "Copy Movie Link")}
                      </button>
                      <p className="text-[9px] md:text-[10px] text-white/40 text-center uppercase tracking-tighter">
                        Paste this link on VLC Player to play manually
                      </p>
                    </div>

                    { !(selectedItem as any).stream_type || (selectedItem as any).stream_type !== 'live' ? (
                      <button 
                        onClick={() => handleAction('download', selectedItem)}
                        className="w-full flex items-center justify-center gap-2 md:gap-3 bg-white/5 hover:bg-white/10 px-4 py-2.5 md:px-6 md:py-3 rounded-xl font-bold transition-all border border-white/5 text-xs md:text-sm"
                      >
                        <Download size={16} md:size={18} /> Download
                      </button>
                    ) : null}
                  </div>
                ) : (
                  /* Episode List for Series */
                  <div className="space-y-4 md:space-y-6 pt-1 md:pt-2">
                    {loadingInfo ? (
                      <div className="flex items-center gap-3 text-white/40 py-4">
                        <Loader2 className="animate-spin" size={18} md:size={20} />
                        <span className="text-xs md:text-sm">Loading episodes...</span>
                      </div>
                    ) : seriesInfo?.episodes ? (
                      <>
                        {/* Seasons Selector */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 md:pb-2">
                          {Object.keys(seriesInfo.episodes).map((seasonNum, idx) => (
                            <button
                              key={`season-${seasonNum}-${idx}`}
                              onClick={() => setSelectedSeason(seasonNum)}
                              className={cn(
                                "whitespace-nowrap px-3 md:px-4 py-1 md:py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all border",
                                selectedSeason === seasonNum 
                                  ? "bg-cyan-600 border-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]" 
                                  : "bg-white/5 border-white/10 text-white/60 hover:border-white/30"
                              )}
                            >
                              Season {seasonNum}
                            </button>
                          ))}
                        </div>

                        {/* Episodes List */}
                        <div className="space-y-2 max-h-[300px] md:max-h-[400px] overflow-y-auto pr-1 md:pr-2 no-scrollbar pb-20 md:pb-10">
                          {seriesInfo.episodes[selectedSeason || '']?.map((episode: any, idx: number) => (
                            <div 
                              key={`episode-${episode.id}-${idx}`}
                              className="group/ep flex items-center justify-between p-2.5 md:p-3 rounded-lg md:rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all"
                            >
                              <div className="flex items-center gap-3 md:gap-4">
                                <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-white/10 flex items-center justify-center text-[9px] md:text-[10px] font-bold">
                                  {episode.episode_num}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs md:text-sm font-semibold line-clamp-1">{episode.title}</span>
                                  <span className="text-[9px] md:text-[10px] text-white/40 uppercase tracking-wider">Episode {episode.episode_num}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 md:gap-2">
                                <button 
                                  onClick={() => handleAction('web_play', selectedItem, episode.id, episode.container_extension)}
                                  className="p-1.5 md:p-2 bg-[#00D1FF]/10 text-[#00D1FF] hover:bg-[#00D1FF]/20 rounded-lg transition-colors border border-[#00D1FF]/20"
                                  title="Play Online"
                                >
                                  <Play size={14} md:size={16} fill="currentColor" />
                                </button>
                                <button 
                                  onClick={() => handleAction('play', selectedItem, episode.id, episode.container_extension)}
                                  className="p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition-colors"
                                  title="Play in External Player"
                                >
                                  <Share2 size={14} md:size={16} />
                                </button>
                                <button 
                                  onClick={() => handleAction('copy', selectedItem, episode.id, episode.container_extension)}
                                  className={cn(
                                    "p-1.5 md:p-2 rounded-lg transition-all",
                                    copiedId === episode.id 
                                      ? "bg-green-500/20 text-green-400" 
                                      : "hover:bg-white/20 text-white/60"
                                  )}
                                  title="Copy Episode Link"
                                >
                                  {copiedId === episode.id ? <Check size={14} md:size={16} /> : <Copy size={14} md:size={16} />}
                                </button>
                                <button 
                                  onClick={() => handleAction('download', selectedItem, episode.id, episode.container_extension)}
                                  className="p-1.5 md:p-2 hover:bg-white/20 rounded-lg transition-colors"
                                  title="Download Episode"
                                >
                                  <Download size={14} md:size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs md:text-sm text-white/40 italic">No episodes found for this series.</p>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Internal Web Player Modal */}
      <AnimatePresence>
        {showWebPlayer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-8 lg:p-12 gpu overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWebPlayer(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-2xl gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-6xl aspect-video glass-dark rounded-xl md:rounded-[2rem] overflow-hidden shadow-[0_0_100px_rgba(0,209,255,0.4)] border border-white/20 flex flex-col gpu"
            >
              {/* Minimalist Top Header with Gradient Overlay */}
              <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 md:p-8 bg-gradient-to-b from-black/95 via-black/60 to-transparent pointer-events-none group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-3 md:gap-5 pointer-events-auto">
                  <div className="w-10 h-10 md:w-14 md:h-14 bg-cyan-500/10 backdrop-blur-2xl rounded-xl md:rounded-[1.5rem] flex items-center justify-center border border-cyan-500/40 shadow-[0_0_25px_rgba(0,209,255,0.3)]">
                    <Play size={20} className="text-[#00D1FF] fill-[#00D1FF] md:w-7 md:h-7" />
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-sm md:text-xl font-bold text-white truncate max-w-[160px] md:max-w-2xl drop-shadow-[0_2px_10px_rgba(0,0,0,1)] tracking-tight">
                      {webPlayTitle}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-[#00D1FF] rounded-full animate-pulse shadow-[0_0_10px_#00D1FF]" />
                      <p className="text-[9px] md:text-sm text-[#00D1FF] font-black uppercase tracking-[0.25em] drop-shadow-md">Theater Mode 4K</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setShowWebPlayer(false)}
                  className="p-2.5 md:p-5 bg-black/50 hover:bg-red-500/95 text-white rounded-xl md:rounded-2xl backdrop-blur-2xl border border-white/20 transition-all duration-300 hover:scale-110 active:scale-90 group pointer-events-auto shadow-xl"
                >
                  <X size={20} className="md:w-7 md:h-7 group-hover:rotate-90 transition-transform duration-500" />
                </button>
              </div>

              <div className="flex-1 w-full h-full bg-black relative">
                <VideoPlayer 
                  key={webPlayUrl}
                  options={{
                    autoplay: true,
                    controls: true,
                    isLive: !!(selectedItem as any)?.stream_type && (selectedItem as any).stream_type === 'live',
                    sources: [{
                      src: webPlayUrl,
                      type: webPlayUrl.toLowerCase().includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
                    }]
                  }} 
                  onClose={() => setShowWebPlayer(false)}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 30 }}
              transition={{ 
                type: "spring",
                damping: 20,
                stiffness: 250
              }}
              className="relative w-full max-md glass rounded-3xl p-8 shadow-2xl border border-white/20"
            >
              <button 
                onClick={() => setShowLoginModal(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-display font-bold mb-2 text-gradient">4K•SJ Login</h2>
                <p className="text-white/40 text-sm">Login is required to play or download premium content. You can browse all titles for free.</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40 ml-1">Username</label>
                  <input 
                    name="username"
                    type="text"
                    required
                    placeholder="Your username"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-white/40 ml-1">Password</label>
                  <input 
                    name="password"
                    type="password"
                    required
                    placeholder="Your password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                  />
                </div>

                {loginError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col gap-2 text-red-400 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} /> 
                      <span>{loginError.includes('Click here') ? loginError.split('Click here')[0] : loginError}</span>
                    </div>
                    {loginError.includes('Click here') && (
                      <a 
                        href="https://wa.me/923161611304" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-cyan-400 font-bold underline hover:text-cyan-300 ml-6"
                      >
                        Click here to register new account
                      </a>
                    )}
                  </div>
                )}

                <button 
                  type="submit"
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-4 rounded-xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] mt-4"
                >
                  Login to 4K•SJ
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-white/40 text-xs mb-4 uppercase tracking-widest font-bold">Don't have an account?</p>
                <a 
                  href="https://wa.me/923161611304" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-green-500/10 hover:bg-green-500/20 text-green-400 px-6 py-3 rounded-xl font-bold transition-all border border-green-500/20 w-full justify-center"
                >
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Register New Account
                </a>
                <p className="mt-4 text-[10px] text-white/20 uppercase tracking-tighter">Contact us on WhatsApp to get your premium credentials</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Download Confirmation Modal */}
      <AnimatePresence>
        {showDownloadConfirm && pendingDownload && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDownloadConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 30 }}
              transition={{ type: "spring", damping: 20, stiffness: 250 }}
              className="relative w-full max-w-md glass rounded-3xl p-8 shadow-2xl border border-white/20"
            >
              <button 
                onClick={() => setShowDownloadConfirm(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/30">
                  <Download className="text-cyan-400" size={32} />
                </div>
                <h2 className="text-2xl font-display font-bold mb-2 text-gradient">Download Alert!</h2>
                <p className="text-white/60 text-sm">Please read the following instructions carefully before starting your download.</p>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center shrink-0 text-cyan-400 font-bold text-xs">1</div>
                  <p className="text-xs text-white/80 leading-relaxed">
                    Jab movie download per lagi ho Koi Aur movie download na Karen, ek Ko complete hone den.
                  </p>
                </div>
                <div className="flex gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center shrink-0 text-cyan-400 font-bold text-xs">2</div>
                  <p className="text-xs text-white/80 leading-relaxed">
                    Jab movie download per lagi ho to koi movie ya web series na play Karen jab Tak ke vah download ho rahi hai.
                  </p>
                </div>
                <div className="p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
                  <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Warning:</p>
                  <p className="text-xs text-red-400/80 leading-relaxed">
                    Agar aap in rules par amal nahi karenge to aapki downloading ruk jayegi aur service block ho sakti hai.
                  </p>
                </div>
              </div>

              <button 
                onClick={() => {
                  handleAction('download', pendingDownload.item, pendingDownload.episodeId, pendingDownload.episodeExt, true);
                  setShowDownloadConfirm(false);
                }}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black py-4 rounded-xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
              >
                Download Now
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Next-Level Mobile Floating Navigation - Ultra-Optimized & Premium UI */}
      <AnimatePresence>
        {!shouldHideNav && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] md:hidden w-auto pointer-events-none px-4"
          >
            <div className="relative flex items-center gap-1 p-2 bg-black/80 border border-white/10 rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,1)] backdrop-blur-3xl pointer-events-auto ring-1 ring-white/10">
              {[
                { id: 'home', label: 'HOME', icon: Home, color: 'cyan' },
                { id: 'movies', label: 'MOVIES', icon: Clapperboard, color: 'blue' },
                { id: 'series', label: 'WEB SERIES', icon: Tv, color: 'purple' },
                { id: 'live', label: 'LIVE TV', icon: Zap, color: 'orange' },
                { id: 'free', label: 'FREE', icon: Gift, color: 'yellow' }
              ].map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'movies') setSelectedMovieCategory('0');
                      if (item.id === 'series') setSelectedSeriesCategory('0');
                      if (item.id === 'live') setSelectedLiveCategory('0');
                      if (item.id === 'free') setActiveFreeTab('menu');
                      setActiveTab(item.id as any);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="relative flex flex-col items-center justify-center w-[72px] h-14 transition-transform active:scale-95"
                  >
                    <div className={cn(
                      "relative z-10 flex flex-col items-center gap-1 transition-all duration-300",
                      isActive ? "opacity-100" : "opacity-40"
                    )}>
                      <div className="p-1 rounded-xl">
                        <Icon 
                          size={20} 
                          className={cn(
                            "transition-all duration-300",
                            isActive ? `text-${item.color}-400` : "text-white"
                          )} 
                        />
                      </div>
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-wider leading-none transition-all duration-300",
                        isActive ? `text-${item.color}-400` : "text-white"
                      )}>
                        {item.label}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Content */}



      {/* Free Movie Player Modal */}
      <AnimatePresence>
        {selectedFreeMovie && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 gpu">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFreeMovie(null)}
              className="absolute inset-0 bg-black/98 backdrop-blur-2xl gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl glass rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col"
            >
              <div className="p-4 safe-top flex items-center justify-between border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-cyan-500 rounded-lg flex items-center justify-center border border-cyan-400 shadow-lg">
                    <Play size={20} className="text-black fill-black" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white italic uppercase tracking-tight">{selectedFreeMovie.name}</h3>
                    <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Streaming Free Now</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedFreeMovie(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="relative w-full aspect-video bg-black overflow-hidden min-h-[220px] md:min-h-[400px] flex items-center justify-center">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm z-0">
                  <Loader2 className="animate-spin text-cyan-500" size={40} />
                  <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Initializing Player...</p>
                </div>
                <div className="relative z-10 w-full h-full">
                  <VideoPlayer 
                    key={selectedFreeMovie.play_url}
                    options={{
                      autoplay: true,
                      controls: true,
                      responsive: true,
                      fluid: true,
                      poster: selectedFreeMovie.poster_url,
                      is_embed: selectedFreeMovie.is_embed,
                      skipProxy: true,
                      isLive: false,
                      sources: [{
                        src: selectedFreeMovie.play_url,
                        type: selectedFreeMovie.play_url.includes('.m3u8') ? 'application/x-mpegURL' : 
                              selectedFreeMovie.play_url.toLowerCase().includes('.mp4') ? 'video/mp4' :
                              selectedFreeMovie.play_url.toLowerCase().includes('.webm') ? 'video/webm' :
                              'video/mp4' // Fallback
                      }]
                    }} 
                  />
                </div>
              </div>
              
              <div className="p-6 bg-cyan-500/10 border-t border-cyan-500/20 flex flex-col items-center justify-center gap-4">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {selectedFreeMovie.download_url && (
                    <button 
                      onClick={() => {
                        const filename = `${selectedFreeMovie.name || 'movie'}.${selectedFreeMovie.play_url.split('.').pop() || 'mp4'}`;
                        triggerDownload(selectedFreeMovie.download_url, filename);
                      }}
                      className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all border border-white/10"
                    >
                      <Download size={16} /> Download Movie
                    </button>
                  )}
                  <a 
                    href={formatVlcUrl(selectedFreeMovie.download_url)}
                    className={`flex items-center gap-2 ${(selectedFreeMovie.download_url || selectedFreeMovie.play_url).toLowerCase().includes('.mkv') ? 'bg-orange-500 hover:bg-orange-600 scale-105 ring-2 ring-orange-500/50' : 'bg-orange-500 hover:bg-orange-600'} text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-orange-500/20`}
                  >
                    <Play size={16} /> {(selectedFreeMovie.download_url || selectedFreeMovie.play_url).toLowerCase().includes('.mkv') ? 'Play in VLC (Recommended)' : 'Open in VLC'}
                  </a>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-cyan-400 font-bold uppercase tracking-[0.2em] text-center italic">
                    Watching {selectedFreeMovie.name} with 4K•SJ Free Access
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">High Quality Stream Enabled</p>
                </div>
                
                <a 
                  href="https://chat.whatsapp.com/I1UPXfxwMDR6XhG1DNg2lE" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white px-8 py-3 rounded-2xl font-black text-sm transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,211,102,0.4)] uppercase tracking-widest"
                >
                  <MessageCircle size={20} fill="white" />
                  Join WhatsApp Group
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PSL Player Modal */}
      <AnimatePresence>
        {showPSLPlayer && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 gpu">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPSLPlayer(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-sm gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[95vw] md:w-full md:max-w-5xl glass rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col gpu"
            >
              <div className="p-4 safe-top flex items-center justify-between border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center border border-green-500 shadow-lg shadow-green-600/20">
                    <span className="text-xs font-black text-white">PSL</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">PSL Live Stream</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowPSLPlayer(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="relative w-full aspect-video bg-black overflow-hidden min-h-[220px] md:min-h-[400px]">
                {pslOptions.sources[0].src ? (
                  <VideoPlayer key={pslOptions.sources[0].src} options={{...pslOptions, isLive: true}} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-cyan-500" size={40} />
                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Fetching Live Stream...</p>
                  </div>
                )}
                
                {/* Language Switcher Overlay */}
                <div className="absolute top-4 right-4 z-10 flex items-center gap-1 p-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                  {[
                    { id: 'urdu', label: 'Urdu', color: 'bg-yellow-500' },
                    { id: 'english', label: 'English', color: 'bg-cyan-500' },
                    ...(pslChannel3Url ? [{ id: 'custom' as const, label: pslChannel3Name, color: 'bg-purple-500' }] : [])
                  ].map((lang) => (
                    <button 
                      key={lang.id}
                      onClick={() => setSelectedPslLanguage(lang.id as any)}
                      className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${
                        selectedPslLanguage === lang.id 
                          ? `${lang.color} text-black font-black` 
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
                
                {/* Live Indicator Overlay */}
                {((selectedPslLanguage === 'urdu' || selectedPslLanguage === 'english') || 
                  (selectedPslLanguage === 'custom' && pslChannel3ShowLiveIcon)) && (
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-full shadow-lg shadow-red-600/20">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Live</span>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-yellow-500/10 border-t border-yellow-500/20 flex flex-col items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-yellow-400 font-bold uppercase tracking-[0.2em] text-center">
                    Enjoy the match in {selectedPslLanguage === 'urdu' ? 'Urdu' : 'English'} with 4K•SJ Premium Experience
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">High Quality HLS Stream Enabled</p>
                </div>
                
                <a 
                  href="https://chat.whatsapp.com/I1UPXfxwMDR6XhG1DNg2lE" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white px-8 py-3 rounded-2xl font-black text-sm transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,211,102,0.4)] uppercase tracking-widest"
                >
                  <MessageCircle size={20} fill="white" />
                  Join WhatsApp Group
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* IPL Player Modal */}
      <AnimatePresence>
        {showIPLPlayer && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 gpu">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowIPLPlayer(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-sm gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[95vw] md:w-full md:max-w-5xl glass rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col gpu"
            >
              <div className="p-4 safe-top flex items-center justify-between border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-blue-600 shadow-lg shadow-white/10 overflow-hidden">
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/en/thumb/8/84/Indian_Premier_League_Official_Logo.svg/200px-Indian_Premier_League_Official_Logo.svg.png" 
                      alt="IPL" 
                      className="w-full h-full object-contain p-1"
                      referrerPolicy="no-referrer"
                      onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.iplt20.com/assets/images/IPL-logo-new-old.png'; }}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white">IPL Live Stream</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowIPLPlayer(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="relative w-full aspect-video bg-black overflow-hidden min-h-[220px] md:min-h-[400px]">
                {iplOptions.sources[0].src ? (
                  <VideoPlayer 
                    key={iplOptions.sources[0].src}
                    options={{...iplOptions, isLive: true}}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
                    <Loader2 className="animate-spin text-blue-500" size={40} />
                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest">Fetching Live Stream...</p>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-blue-600/10 border-t border-blue-600/20 flex flex-col items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-blue-400 font-bold uppercase tracking-[0.2em] text-center">
                    Enjoy the match with 4K•SJ Premium Experience
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">High Quality HLS Stream Enabled</p>
                </div>

                <a 
                  href="https://chat.whatsapp.com/I1UPXfxwMDR6XhG1DNg2lE" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white px-8 py-3 rounded-2xl font-black text-sm transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,211,102,0.4)] uppercase tracking-widest"
                >
                  <MessageCircle size={20} fill="white" />
                  Join WhatsApp Group
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showAdminLogin && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-xs glass p-6 rounded-2xl border border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Admin Login</h3>
                <button onClick={() => setShowAdminLogin(false)} className="text-white/40 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-white/40 font-bold mb-1.5">Password</label>
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500/50"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                >
                  Login
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Free Series Player Modal */}
      <AnimatePresence>
        {selectedFreeSeries && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 gpu">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedFreeSeries(null)}
              className="absolute inset-0 bg-black/98 backdrop-blur-2xl gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-5xl glass rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col max-h-[95vh] gpu"
            >
              <div className="p-4 safe-top flex items-center justify-between border-b border-white/10 bg-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center border border-purple-500 shadow-lg group">
                    <Tv size={20} className="text-white group-hover:rotate-12 transition-transform" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-white italic tracking-tight uppercase line-clamp-1">{selectedFreeSeries.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Streaming Quality 4K</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setSelectedFreeSeries(null)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  >
                    <X size={28} />
                  </button>
                </div>
              </div>

              <div className="relative w-full aspect-video bg-black overflow-hidden flex-1 group">
                {selectedFreeSeries.is_embed ? (
                  <iframe
                    src={selectedFreeSeries.play_url}
                    className="w-full h-full border-0"
                    allowFullScreen
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <VideoPlayer 
                    key={selectedFreeSeries.play_url}
                    options={{
                      autoplay: true,
                      controls: true,
                      responsive: true,
                      fluid: true,
                      isLive: false,
                      poster: selectedFreeSeries.poster_url,
                      is_embed: selectedFreeSeries.is_embed,
                      skipProxy: true,
                      sources: [{
                        src: selectedFreeSeries.play_url,
                        type: selectedFreeSeries.play_url.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
                      }]
                    }} 
                  />
                )}
              </div>

              <div className="p-6 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between gap-6">
                <div className="flex flex-wrap items-center gap-4">
                  <button 
                    onClick={() => {
                      const shareText = `Watching ${selectedFreeSeries.name} for FREE on 4K•SJ! Check it out: ${window.location.origin}`;
                      navigator.share?.({ title: '4K•SJ Free Access', text: shareText, url: window.location.origin })
                        .catch(() => {
                           navigator.clipboard.writeText(shareText);
                           alert("Share link copied to clipboard!");
                        });
                    }}
                    className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all border border-white/10"
                  >
                    <Share2 size={16} /> Share Now
                  </button>
                  {selectedFreeSeries.download_url && (
                    <a 
                      href={selectedFreeSeries.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all border border-white/10"
                    >
                      <Download size={16} /> Download Series
                    </a>
                  )}
                  <a 
                    href={formatVlcUrl(selectedFreeSeries.download_url || selectedFreeSeries.play_url)}
                    className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-orange-500/20"
                  >
                    <Play size={16} /> Play in VLC
                  </a>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm text-purple-400 font-bold uppercase tracking-[0.2em] text-center italic">
                    Watching {selectedFreeSeries.name} with 4K•SJ Free Access
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">High Quality Stream Enabled</p>
                </div>
                
                <a 
                  href="https://chat.whatsapp.com/I1UPXfxwMDR6XhG1DNg2lE" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-[#25D366] hover:bg-[#128C7E] text-white px-8 py-3 rounded-2xl font-black text-sm transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(37,211,102,0.4)] uppercase tracking-widest"
                >
                  <MessageCircle size={20} fill="white" />
                  Join WhatsApp Group
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Standalone Admin Panel Modal */}
      <AnimatePresence>
        {isAdminLoggedIn && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 gpu">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdminLoggedIn(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl gpu"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl bg-[#0a0a0b] rounded-[3rem] overflow-hidden shadow-[0_0_80px_rgba(34,211,238,0.2)] border border-white/10 flex flex-col gpu"
            >
              <div className="p-6 flex items-center justify-between border-b border-white/5 bg-white/5">
                <div className="flex flex-col">
                  <h3 className="text-xl font-black text-white italic tracking-tighter uppercase">Admin Control Center</h3>
                  <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-widest">Logged in: {currentUser?.email}</span>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => {
                      setIsAdminLoggedIn(false);
                    }}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-red-500/20"
                  >
                    Log Out
                  </button>
                  <button 
                    onClick={() => setIsAdminLoggedIn(false)}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 bg-black/40 border-b border-white/5">
                <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar">
                  {(['psl', 'ipl', 'app', 'free_movies', 'free_series'] as const).map((tab) => (
                    <button 
                      key={tab}
                      onClick={() => setActiveAdminTab(tab)}
                      className={`min-w-[80px] flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        activeAdminTab === tab 
                          ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' 
                          : 'text-white/40 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {tab === 'app' ? 'General' : tab.replace('free_', '').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto no-scrollbar max-h-[60vh]">
                <div className="flex flex-col gap-6">
                  {activeAdminTab === 'app' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* PSL Toggle */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest">PSL Settings</h4>
                          <button 
                            onClick={() => setNewAppSettings(prev => ({ ...prev, psl_enabled: !prev.psl_enabled }))}
                            className={cn("w-12 h-6 rounded-full relative transition-all duration-300", newAppSettings.psl_enabled ? "bg-cyan-500" : "bg-white/10")}
                          >
                            <motion.div animate={{ x: newAppSettings.psl_enabled ? 26 : 2 }} className="w-5 h-5 bg-white rounded-full absolute top-0.5" />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={newAppSettings.psl_title || ''}
                          onChange={(e) => setNewAppSettings(prev => ({ ...prev, psl_title: e.target.value }))}
                          placeholder="Category Title"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                      {/* IPL Toggle */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest">IPL Settings</h4>
                          <button 
                            onClick={() => setNewAppSettings(prev => ({ ...prev, ipl_enabled: !prev.ipl_enabled }))}
                            className={cn("w-12 h-6 rounded-full relative transition-all duration-300", newAppSettings.ipl_enabled ? "bg-blue-500" : "bg-white/10")}
                          >
                            <motion.div animate={{ x: newAppSettings.ipl_enabled ? 26 : 2 }} className="w-5 h-5 bg-white rounded-full absolute top-0.5" />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={newAppSettings.ipl_title || ''}
                          onChange={(e) => setNewAppSettings(prev => ({ ...prev, ipl_title: e.target.value }))}
                          placeholder="Category Title"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      {/* Free Movies Toggle */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest">Free Movies</h4>
                          <button 
                            onClick={() => setNewAppSettings(prev => ({ ...prev, free_movies_enabled: !prev.free_movies_enabled }))}
                            className={cn("w-12 h-6 rounded-full relative transition-all duration-300", newAppSettings.free_movies_enabled ? "bg-indigo-500" : "bg-white/10")}
                          >
                            <motion.div animate={{ x: newAppSettings.free_movies_enabled ? 26 : 2 }} className="w-5 h-5 bg-white rounded-full absolute top-0.5" />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={newAppSettings.free_movies_title || ''}
                          onChange={(e) => setNewAppSettings(prev => ({ ...prev, free_movies_title: e.target.value }))}
                          placeholder="Category Title"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50"
                        />
                      </div>
                      {/* Free Series Toggle */}
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-black text-purple-400 uppercase tracking-widest">Free Series</h4>
                          <button 
                            onClick={() => setNewAppSettings(prev => ({ ...prev, free_series_enabled: !prev.free_series_enabled }))}
                            className={cn("w-12 h-6 rounded-full relative transition-all duration-300", newAppSettings.free_series_enabled ? "bg-purple-500" : "bg-white/10")}
                          >
                            <motion.div animate={{ x: newAppSettings.free_series_enabled ? 26 : 2 }} className="w-5 h-5 bg-white rounded-full absolute top-0.5" />
                          </button>
                        </div>
                        <input 
                          type="text" 
                          value={newAppSettings.free_series_title || ''}
                          onChange={(e) => setNewAppSettings(prev => ({ ...prev, free_series_title: e.target.value }))}
                          placeholder="Category Title"
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500/50"
                        />
                      </div>
                    </div>
                  </div>
                )}
                  {activeAdminTab === 'psl' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">PSL Urdu Stream URL</label>
                          <input 
                            type="text" 
                            value={newPslUrlUrdu}
                            onChange={(e) => setNewPslUrlUrdu(e.target.value)}
                            placeholder="Enter .m3u8 URL"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">PSL English Stream URL</label>
                          <input 
                            type="text" 
                            value={newPslUrlEnglish}
                            onChange={(e) => setNewPslUrlEnglish(e.target.value)}
                            placeholder="Enter .m3u8 URL"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-3xl space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Custom Channel 3</h4>
                          <span className="text-[8px] text-white/20 uppercase font-bold tracking-widest italic font-mono">Premium Expansion</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Channel Name</label>
                            <input 
                              type="text" 
                              value={newPslChannel3Name}
                              onChange={(e) => setNewPslChannel3Name(e.target.value)}
                              placeholder="e.g. Hindi, PTV Sports, etc."
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Stream URL</label>
                            <input 
                              type="text" 
                              value={newPslChannel3Url}
                              onChange={(e) => setNewPslChannel3Url(e.target.value)}
                              placeholder="URL or Embed Code"
                              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/50"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                            <input 
                              type="checkbox" 
                              id="psl_3_embed"
                              checked={newPslChannel3IsEmbed}
                              onChange={(e) => setNewPslChannel3IsEmbed(e.target.checked)}
                              className="w-4 h-4 accent-purple-500"
                            />
                            <label htmlFor="psl_3_embed" className="text-[10px] text-white/60 font-black uppercase tracking-widest cursor-pointer">Embed Mode</label>
                          </div>
                          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                            <input 
                              type="checkbox" 
                              id="psl_3_live_icon"
                              checked={newPslChannel3ShowLiveIcon}
                              onChange={(e) => setNewPslChannel3ShowLiveIcon(e.target.checked)}
                              className="w-4 h-4 accent-purple-500"
                            />
                            <label htmlFor="psl_3_live_icon" className="text-[10px] text-white/60 font-black uppercase tracking-widest cursor-pointer">Show Live Icon</label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeAdminTab === 'ipl' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">IPL Stream URL</label>
                      <input 
                        type="text" 
                        value={newIplUrl}
                        onChange={(e) => setNewIplUrl(e.target.value)}
                        placeholder="Enter .m3u8 URL"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                      />
                    </div>
                  )}

                  {(activeAdminTab === 'free_movies' || activeAdminTab === 'free_series') && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Title</label>
                          <input 
                            type="text" 
                            value={activeAdminTab === 'free_movies' ? newFreeMovie.name : newFreeSeries.name}
                            onChange={(e) => activeAdminTab === 'free_movies' 
                              ? setNewFreeMovie({...newFreeMovie, name: e.target.value}) 
                              : setNewFreeSeries({...newFreeSeries, name: e.target.value})
                            }
                            placeholder="Display Name"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Poster URL</label>
                          <input 
                            type="text" 
                            value={activeAdminTab === 'free_movies' ? newFreeMovie.poster_url : newFreeSeries.poster_url}
                            onChange={(e) => activeAdminTab === 'free_movies' 
                              ? setNewFreeMovie({...newFreeMovie, poster_url: e.target.value}) 
                              : setNewFreeSeries({...newFreeSeries, poster_url: e.target.value})
                            }
                            placeholder="Image URL"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Streaming Link</label>
                        <input 
                          type="text" 
                          value={activeAdminTab === 'free_movies' ? newFreeMovie.play_url : newFreeSeries.play_url}
                          onChange={(e) => activeAdminTab === 'free_movies' 
                            ? setNewFreeMovie({...newFreeMovie, play_url: e.target.value}) 
                            : setNewFreeSeries({...newFreeSeries, play_url: e.target.value})
                          }
                          placeholder="Source Link"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex-1 space-y-2">
                          <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Download Link (Optional)</label>
                          <input 
                            type="text" 
                            value={activeAdminTab === 'free_movies' ? newFreeMovie.download_url : newFreeSeries.download_url}
                            onChange={(e) => activeAdminTab === 'free_movies' 
                              ? setNewFreeMovie({...newFreeMovie, download_url: e.target.value}) 
                              : setNewFreeSeries({...newFreeSeries, download_url: e.target.value})
                            }
                            placeholder="Optional File Link"
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
                          />
                        </div>
                        <div className="flex flex-col gap-2 pt-6">
                           <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                            <input 
                              type="checkbox" 
                              id="is_embed_admin"
                              checked={activeAdminTab === 'free_movies' ? newFreeMovie.is_embed : newFreeSeries.is_embed}
                              onChange={(e) => activeAdminTab === 'free_movies' 
                                ? setNewFreeMovie({...newFreeMovie, is_embed: e.target.checked}) 
                                : setNewFreeSeries({...newFreeSeries, is_embed: e.target.checked})
                              }
                              className="w-4 h-4 accent-cyan-500"
                            />
                            <label htmlFor="is_embed_admin" className="text-[10px] text-white/60 font-black uppercase tracking-widest cursor-pointer">Embed Mode</label>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={activeAdminTab === 'free_movies' ? handleAddFreeMovie : handleAddFreeSeries}
                        className={`w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all shadow-xl ${
                          (activeAdminTab === 'free_movies' ? editingMovieId : editingSeriesId)
                            ? 'bg-yellow-500 text-black shadow-yellow-500/20' 
                            : 'bg-cyan-500 text-black shadow-cyan-500/20'
                        }`}
                      >
                        {(activeAdminTab === 'free_movies' ? editingMovieId : editingSeriesId) ? 'Update Entry' : 'Publish to Hub'}
                      </button>

                      <div className="space-y-3">
                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Recent Management</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(activeAdminTab === 'free_movies' ? freeMovies : freeSeries).map((item, idx) => (
                            <div key={`admin-v2-${item.id}-${idx}`} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 group">
                              <div className="flex flex-col gap-0.5 max-w-[140px]">
                                <span className="text-[11px] text-white font-bold truncate">{item.name}</span>
                                <span className="text-[8px] text-white/30 uppercase tracking-widest font-black">Online Now</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    if (activeAdminTab === 'free_movies') {
                                      setEditingMovieId(item.id);
                                      setNewFreeMovie({ ...item });
                                    } else {
                                      setEditingSeriesId(item.id);
                                      setNewFreeSeries({ ...item });
                                    }
                                  }}
                                  className="w-8 h-8 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 flex items-center justify-center transition-all"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button 
                                  onClick={() => activeAdminTab === 'free_movies' ? handleDeleteFreeMovie(item.id) : handleDeleteFreeSeries(item.id)}
                                  className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-all"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeAdminTab !== 'free_movies' && activeAdminTab !== 'free_series' && (
                    <button 
                      onClick={handleUpdateUrl}
                      className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-black py-4 rounded-2xl text-xs font-black uppercase tracking-[0.3em] transition-all shadow-xl shadow-cyan-500/20"
                    >
                      Update Hub Status
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 bg-white/5 text-center">
                 <p className="text-[9px] text-white/20 uppercase tracking-[0.3em] font-bold italic">Admin Surface v2.0 • Secure Session Exclusive</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="p-8 pb-24 md:pb-8 text-center border-t border-white/5 bg-black/20">
        <div className="mb-4">
          <h2 className="text-xl font-display font-black tracking-tighter italic">4K•SJ</h2>
          <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.3em] mt-1">Premium Experience</p>
        </div>
        <p className="text-white/20 text-[10px] font-medium uppercase tracking-[0.2em]">
          Powered by 4K•SJ Engine • Premium Content Delivery
        </p>
      </footer>
    </div>
  );
}
