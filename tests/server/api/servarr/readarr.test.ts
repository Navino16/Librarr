import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosInstance } from 'axios';

vi.mock('axios');
vi.mock('@server/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import axios from 'axios';
import ReadarrApi from '@server/api/servarr/readarr';
import type { ReadarrAddOptions } from '@server/api/servarr/readarr';
import logger from '@server/logger';

const mockedAxiosCreate = vi.mocked(axios.create);

let mockAxiosInstance: {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  interceptors: { response: { use: ReturnType<typeof vi.fn> } };
};

beforeEach(() => {
  vi.resetAllMocks();

  mockAxiosInstance = {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { response: { use: vi.fn() } },
  };
  mockedAxiosCreate.mockReturnValue(
    mockAxiosInstance as unknown as AxiosInstance
  );
});

describe('ReadarrApi — getQualityProfiles()', () => {
  it('calls GET /api/v1/qualityprofile', async () => {
    const profiles = [{ id: 1, name: 'HD' }];
    mockAxiosInstance.get.mockResolvedValue({ data: profiles });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.getQualityProfiles();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/qualityprofile',
      undefined
    );
    expect(result).toEqual(profiles);
  });
});

describe('ReadarrApi — getMetadataProfiles()', () => {
  it('calls GET /api/v1/metadataprofile', async () => {
    const profiles = [{ id: 1, name: 'Standard' }];
    mockAxiosInstance.get.mockResolvedValue({ data: profiles });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.getMetadataProfiles();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/metadataprofile',
      undefined
    );
    expect(result).toEqual(profiles);
  });
});

describe('ReadarrApi — getBooks()', () => {
  it('calls GET /api/v1/book', async () => {
    const books = [{ id: 1, title: 'Test Book', foreignBookId: 'fb1', monitored: true, grabbed: false, added: '2024-01-01' }];
    mockAxiosInstance.get.mockResolvedValue({ data: books });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.getBooks();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/book',
      undefined
    );
    expect(result).toEqual(books);
  });
});

describe('ReadarrApi — getBook()', () => {
  it('calls GET /api/v1/book/:id', async () => {
    const book = { id: 42, title: 'Specific Book', foreignBookId: 'fb42', monitored: true, grabbed: false, added: '2024-01-01' };
    mockAxiosInstance.get.mockResolvedValue({ data: book });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.getBook(42);

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/book/42',
      undefined
    );
    expect(result).toEqual(book);
  });
});

describe('ReadarrApi — lookupBook()', () => {
  it('calls GET /api/v1/book/lookup with term param', async () => {
    const books = [{ id: 1, title: 'Found Book', foreignBookId: 'fb1', monitored: false, grabbed: false, added: '2024-01-01' }];
    mockAxiosInstance.get.mockResolvedValue({ data: books });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.lookupBook('Harry Potter');

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/book/lookup',
      { params: { term: 'Harry Potter' } }
    );
    expect(result).toEqual(books);
  });
});

describe('ReadarrApi — addBook()', () => {
  const addOptions: ReadarrAddOptions = {
    title: 'New Book',
    foreignBookId: 'fb-new',
    qualityProfileId: 1,
    rootFolderPath: '/books',
    monitored: true,
    addOptions: { addType: 'automatic', searchForNewBook: true },
    author: {
      foreignAuthorId: 'fa-1',
      qualityProfileId: 1,
      rootFolderPath: '/books',
      monitored: true,
    },
  };

  it('calls POST /api/v1/book with options and returns result', async () => {
    const created = { id: 99, title: 'New Book', foreignBookId: 'fb-new', monitored: true, grabbed: false, added: '2024-01-01' };
    mockAxiosInstance.post.mockResolvedValue({ data: created });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.addBook(addOptions);

    expect(mockAxiosInstance.post).toHaveBeenCalledWith(
      '/api/v1/book',
      addOptions,
      undefined
    );
    expect(result).toEqual(created);
  });

  it('logs the error and re-throws when POST fails', async () => {
    const error = new Error('conflict');
    mockAxiosInstance.post.mockRejectedValue(error);

    const api = new ReadarrApi('http://localhost:8787', 'key');
    await expect(api.addBook(addOptions)).rejects.toThrow('conflict');
    expect(logger.error).toHaveBeenCalledWith('Readarr add book error', {
      error,
    });
  });
});

describe('ReadarrApi — getAuthors()', () => {
  it('calls GET /api/v1/author', async () => {
    const authors = [{ id: 1, authorName: 'Author', foreignAuthorId: 'fa1', monitored: true }];
    mockAxiosInstance.get.mockResolvedValue({ data: authors });

    const api = new ReadarrApi('http://localhost:8787', 'key');
    const result = await api.getAuthors();

    expect(mockAxiosInstance.get).toHaveBeenCalledWith(
      '/api/v1/author',
      undefined
    );
    expect(result).toEqual(authors);
  });
});

