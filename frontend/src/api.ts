import axios from 'axios'
import type {
  AltDataResponse,
  BacktestConfig,
  BacktestResults,
  SignalsResponse,
  TickerMeta,
} from './types'

const http = axios.create({ baseURL: '/api' })

export const api = {
  universe: (): Promise<TickerMeta[]> =>
    http.get('/universe').then(r => r.data),

  altData: (start?: string, end?: string): Promise<AltDataResponse> =>
    http.get('/alt-data', { params: { start, end } }).then(r => r.data),

  signals: (
    start?: string,
    end?: string,
    weights?: { job_w: number; web_w: number; ship_w: number; sat_w: number },
  ): Promise<SignalsResponse> =>
    http.get('/signals', { params: { start, end, ...weights } }).then(r => r.data),

  backtest: (cfg: BacktestConfig): Promise<BacktestResults> =>
    http.post('/backtest', cfg).then(r => r.data),

  embeddingScores: (): Promise<Record<string, number>> =>
    http.get('/embedding-scores').then(r => r.data),
}
