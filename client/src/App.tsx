import { Route, Routes } from 'react-router-dom'
import { PageMessage, Shell } from './components/Shell'
import { AdminQueue } from './pages/AdminQueue'
import { AdminRequestPage } from './pages/AdminRequestPage'
import { Landing } from './pages/Landing'
import { RequestPage } from './pages/RequestPage'
import { ResidentHome } from './pages/ResidentHome'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/resident/:communityId/:residentId" element={<ResidentHome />} />
      <Route path="/resident/:communityId/:residentId/requests/:requestId" element={<RequestPage />} />
      <Route path="/admin/:communityId" element={<AdminQueue />} />
      <Route path="/admin/:communityId/requests/:id" element={<AdminRequestPage />} />
      <Route
        path="*"
        element={
          <Shell>
            <PageMessage title="Page not found" />
          </Shell>
        }
      />
    </Routes>
  )
}

export default App
