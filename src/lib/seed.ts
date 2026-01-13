
import {
  Firestore,
  writeBatch,
  doc,
  collection,
} from 'firebase/firestore';
import { incidents, policyPacks } from '@/lib/data';

/**
 * Seeds the Firestore database with initial data for incidents and policy packs.
 * This function is intended to be called from a trusted client-side environment
 * where a user is authenticated.
 *
 * @param {Firestore} firestore - The Firestore database instance.
 */
export async function seedDatabase(firestore: Firestore) {
  if (!firestore) {
    throw new Error('Firestore instance is not available.');
  }

  // Create a batch to perform all writes together.
  const batch = writeBatch(firestore);

  // Seed event_logs (incidents)
  const eventsCollection = collection(firestore, 'event_logs');
  console.log(`Preparing to seed ${incidents.length} incidents...`);
  incidents.forEach((incident) => {
    const docRef = doc(eventsCollection, incident.id);
    batch.set(docRef, incident);
  });

  // Seed rules (policy packs)
  const rulesCollection = collection(firestore, 'rules');
  console.log(`Preparing to seed ${policyPacks.length} policy packs...`);
  policyPacks.forEach((pack) => {
    const docRef = doc(rulesCollection, pack.id);
    batch.set(docRef, pack);
  });
  
  // In a real app, you might also seed the domain allowlist.
  // For now, we'll leave it empty.

  console.log('Committing batch...');
  await batch.commit();
  console.log('Database seeded successfully.');
}
