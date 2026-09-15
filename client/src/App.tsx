import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { Toaster } from 'sonner'
import { AppRoutes } from '@/routes/AppRoutes'
import { store } from '@/store/store'

function App() {
  return <Provider store={store}><BrowserRouter><AppRoutes /></BrowserRouter><Toaster position="top-right" richColors /></Provider>
}

export default App
