import axios from 'axios';
import { XtreamCredentials, Category, Stream, Series, LoginResponse, LiveStream } from '../types';

export const DEFAULT_CREDENTIALS: XtreamCredentials = {
  host: 'https://4ksj.store',
  username: 'webplayer44',
  password: '62246624',
};

const proxyRequest = async (params: any, retries = 3, backoff = 1000): Promise<any> => {
  try {
    const response = await axios.get('/api/proxy', { params });
    return response.data;
  } catch (error: any) {
    if (error.response?.status === 429 && retries > 0) {
      console.warn(`Got 429, retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return proxyRequest(params, retries - 1, backoff * 2);
    }
    throw error;
  }
};

export const xtreamApi = {
  login: async (creds: XtreamCredentials): Promise<LoginResponse> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}`;
    return proxyRequest({ url });
  },

  getMovieCategories: async (creds: XtreamCredentials): Promise<Category[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_vod_categories`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getMovies: async (creds: XtreamCredentials, categoryId: string = '0'): Promise<Stream[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_vod_streams${categoryId !== '0' ? `&category_id=${categoryId}` : ''}`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getSeriesCategories: async (creds: XtreamCredentials): Promise<Category[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_series_categories`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getSeries: async (creds: XtreamCredentials, categoryId: string = '0'): Promise<Series[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_series${categoryId !== '0' ? `&category_id=${categoryId}` : ''}`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getSeriesInfo: async (creds: XtreamCredentials, seriesId: string): Promise<any> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_series_info&series_id=${seriesId}`;
    return proxyRequest({ url });
  },

  getLiveCategories: async (creds: XtreamCredentials): Promise<Category[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_categories`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getLiveStreams: async (creds: XtreamCredentials, categoryId: string = '0'): Promise<LiveStream[]> => {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_streams${categoryId !== '0' ? `&category_id=${categoryId}` : ''}`;
    const data = await proxyRequest({ url });
    return Array.isArray(data) ? data : [];
  },

  getStreamUrl: (creds: XtreamCredentials, streamId: string, extension: string = 'mp4', type: 'movie' | 'series' | 'live' = 'movie') => {
    if (type === 'live') {
      return `${creds.host}/live/${creds.username}/${creds.password}/${streamId}.ts`;
    }
    return `${creds.host}/${type}/${creds.username}/${creds.password}/${streamId}.${extension}`;
  }
};
