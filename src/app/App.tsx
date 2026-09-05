import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import {
  DatabaseRevisionBoundary,
  PeopleDataBoundary,
  PersonDataBoundary,
  TeamDataBoundary,
} from './components/DataBoundary';
import { AboutPage } from './pages/AboutPage';
import { AwardsPage } from './pages/AwardsPage';
import { CompetitionPage } from './pages/CompetitionPage';
import { HomePage } from './pages/HomePage';
import { InstitutionDetailPage } from './pages/InstitutionDetailPage';
import { InstitutionsPage } from './pages/InstitutionsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PeoplePage } from './pages/PeoplePage';
import { PersonDetailPage } from './pages/PersonDetailPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { TeamsPage } from './pages/TeamsPage';

export function App() {
  return (
    <DatabaseRevisionBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route
            path="/teams/:teamId"
            element={
              <TeamDataBoundary>
                <TeamDetailPage />
              </TeamDataBoundary>
            }
          />
          <Route
            path="/people"
            element={
              <PeopleDataBoundary>
                <PeoplePage />
              </PeopleDataBoundary>
            }
          />
          <Route
            path="/people/:personId"
            element={
              <PersonDataBoundary>
                <PersonDetailPage />
              </PersonDataBoundary>
            }
          />
          <Route path="/institutions" element={<InstitutionsPage />} />
          <Route
            path="/institutions/:institutionId"
            element={<InstitutionDetailPage />}
          />
          <Route path="/competition" element={<CompetitionPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </DatabaseRevisionBoundary>
  );
}
